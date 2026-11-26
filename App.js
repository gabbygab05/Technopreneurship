import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, Linking, Modal, PanResponder,
  Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { colors, platformColor } from './utils/colors';

const FIRST_LAUNCH_KEY = 'elingkod.guideSeen.v2';
const REPORTS_STORAGE_KEY = 'elingkod.userReports.v1';
const PRO_ACTIVE_KEY = 'elingkod.proActive.v1';
const PRO_TOOLS_STORAGE_KEY = 'elingkod.proTools.v1';
const PLATFORMS = ['Angkas', 'Move It', 'JoyRide'];
const USTP_COORDS = { latitude: 8.4859, longitude: 124.6565 };

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const EXPANDED_OFFSET = 0;
const COLLAPSED_OFFSET = Math.round(SCREEN_HEIGHT * 0.44);

const DESTINATIONS = [
  {
    id: 'sm-downtown',
    title: 'SM Downtown',
    subtitle: 'CM Recto Ave · Cagayan de Oro',
    coords: { latitude: 8.485026, longitude: 124.654297 },
    fallbackKm: 1.4,
    fallbackMin: 6,
  },
  {
    id: 'limketkai',
    title: 'Limketkai Center',
    subtitle: 'Lapasan · Cagayan de Oro',
    coords: { latitude: 8.481894, longitude: 124.657457 },
    fallbackKm: 1.2,
    fallbackMin: 5,
  },
  {
    id: 'gmall',
    title: 'Gaisano Mall (Gmall)',
    subtitle: 'Corrales Ext · Cagayan de Oro',
    coords: { latitude: 8.486205, longitude: 124.649802 },
    fallbackKm: 2.1,
    fallbackMin: 9,
  },
  {
    id: 'cogon',
    title: 'Cogon Market',
    subtitle: 'Osmeña St · Cagayan de Oro',
    coords: { latitude: 8.476903, longitude: 124.651908 },
    fallbackKm: 1.9,
    fallbackMin: 8,
  },
];

const INITIAL_FARE_BENCHMARKS = {
  Angkas: { min: 55, max: 80, sourceLabel: 'Reference estimate' },
  'Move It': { min: 50, max: 75, sourceLabel: 'Reference estimate' },
  JoyRide: { min: 55, max: 80, sourceLabel: 'Reference estimate' },
};

const INITIAL_USER_REPORTS = [
  {
    id: 'rep-1',
    platform: 'Move It',
    fare: 55,
    route: 'USTP CDO → Limketkai Center',
    feedback: 'Fast pickup outside USTP gate; clean helmet provided.',
    date: 'Nov 2026',
    source: 'User-reported',
  },
  {
    id: 'rep-2',
    platform: 'Angkas',
    fare: 62,
    route: 'USTP CDO → SM Downtown',
    feedback: 'Smooth ride along Recto Ave during afternoon rush.',
    date: 'Nov 2026',
    source: 'User-reported',
  },
  {
    id: 'rep-3',
    platform: 'JoyRide',
    fare: 60,
    route: 'USTP CDO → Gaisano Mall (Gmall)',
    feedback: 'Fair price; double-check exact drop-off pin before booking.',
    date: 'Nov 2026',
    source: 'User-reported',
  },
];

const platformLinks = {
  Angkas: 'https://www.angkas.com/',
  'Move It': 'https://moveit.com.ph/',
  JoyRide: 'https://joyride.com.ph/',
};

const platformApps = {
  Angkas: {
    androidPackage: 'com.angkas.passenger',
    iosScheme: 'angkas://',
    iosStore: 'https://apps.apple.com/ph/app/angkas-motorcycle-taxi-ph/id6464280697',
  },
  'Move It': {
    androidPackage: 'com.moveit.app.customer',
    iosScheme: 'moveit://',
    iosStore: 'https://apps.apple.com/ph/app/move-it-book-a-moto-taxi/id1481198245',
  },
  JoyRide: {
    androidPackage: 'com.joyride.rider',
    iosScheme: 'joyride://',
    iosStore: 'https://apps.apple.com/ph/app/joyride-book-moto-taxi-car/id1482083123',
  },
};

async function resolveLocationCoordinates(placeText) {
  const text = placeText.trim();
  const coordinateMatch = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coordinateMatch) {
    return { latitude: Number(coordinateMatch[1]), longitude: Number(coordinateMatch[2]) };
  }

  const normalized = text.toLowerCase();
  if (normalized === 'current location') return USTP_COORDS;
  if (normalized.includes('ustp') || normalized.includes('claro m. recto')) return USTP_COORDS;
  const knownDestination = DESTINATIONS.find((item) =>
    normalized.includes(item.title.toLowerCase()) || item.title.toLowerCase().includes(normalized)
  );
  if (knownDestination) return knownDestination.coords;

  try {
    const results = await Location.geocodeAsync(text);
    if (results.length) {
      return { latitude: results[0].latitude, longitude: results[0].longitude };
    }
  } catch {
    // The caller will show a helpful message when the place cannot be resolved.
  }
  return null;
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSimulatedTrafficRoute(originText, destinationText, originCoords, destinationCoords) {
  const seed = hashText(`${originText.trim().toLowerCase()}|${destinationText.trim().toLowerCase()}`);
  const latitudeDelta = destinationCoords.latitude - originCoords.latitude;
  const longitudeDelta = destinationCoords.longitude - originCoords.longitude;
  const span = Math.hypot(latitudeDelta, longitudeDelta);
  const perpendicular = span > 0
    ? { latitude: -longitudeDelta / span, longitude: latitudeDelta / span }
    : { latitude: 0, longitude: 0 };
  const bend = Math.min(span * 0.16, 0.006);
  const pointCount = 25;
  const routeCoordinates = Array.from({ length: pointCount }, (_, index) => {
    const progress = index / (pointCount - 1);
    const curve = Math.sin(Math.PI * progress) * Math.sin(progress * Math.PI * 2 + (seed % 628) / 100) * bend;
    return {
      latitude: originCoords.latitude + latitudeDelta * progress + perpendicular.latitude * curve,
      longitude: originCoords.longitude + longitudeDelta * progress + perpendicular.longitude * curve,
    };
  });

  const traffic = [
    { name: 'Light', color: '#22A06B', multiplier: 1 },
    { name: 'Moderate', color: '#F59E0B', multiplier: 1.35 },
    { name: 'Heavy', color: '#E5484D', multiplier: 1.7 },
  ];
  const startLevel = seed % traffic.length;
  const segmentCount = pointCount - 1;
  const routeSegments = Array.from({ length: segmentCount }, (_, index) => {
    const level = Math.min(2, Math.floor((index / segmentCount) * traffic.length));
    const status = traffic[(startLevel + level) % traffic.length];
    return {
      coordinates: [routeCoordinates[index], routeCoordinates[index + 1]],
      color: status.color,
      traffic: status.name,
    };
  });

  const radians = Math.PI / 180;
  const lat1 = originCoords.latitude * radians;
  const lat2 = destinationCoords.latitude * radians;
  const latDistance = (destinationCoords.latitude - originCoords.latitude) * radians;
  const lngDistance = (destinationCoords.longitude - originCoords.longitude) * radians;
  const haversine = Math.sin(latDistance / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDistance / 2) ** 2;
  const straightDistanceKm = 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const distanceKm = Number(Math.max(0.4, straightDistanceKm * 1.25).toFixed(1));
  const averageTrafficMultiplier = routeSegments.reduce((sum, segment) => {
    return sum + (traffic.find((item) => item.name === segment.traffic)?.multiplier ?? 1);
  }, 0) / routeSegments.length;
  const trafficCounts = routeSegments.reduce((counts, segment) => {
    counts[segment.traffic] = (counts[segment.traffic] ?? 0) + 1;
    return counts;
  }, {});
  const trafficSummary = ['Heavy', 'Moderate', 'Light']
    .filter((level) => trafficCounts[level])
    .join(' · ');

  return {
    originCoords,
    destinationCoords,
    routeCoordinates,
    routeSegments,
    distanceKm,
    durationMin: Math.max(3, Math.round(distanceKm * 4.2 * averageTrafficMultiplier)),
    trafficSummary,
    source: 'Simulated traffic · not live conditions',
  };
}

async function redirectToPlatform(platformName) {
  const app = platformApps[platformName];
  const webUrl = platformLinks[platformName];
  if (!app) return;

  try {
    if (Platform.OS === 'android') {
      await Linking.openURL(
        `intent://#Intent;package=${app.androidPackage};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`
      );
    } else if (Platform.OS === 'ios') {
      await Linking.openURL(app.iosScheme);
    } else {
      await Linking.openURL(webUrl);
    }
  } catch {
    const storeUrl =
      Platform.OS === 'ios'
        ? app.iosStore
        : `https://play.google.com/store/apps/details?id=${app.androidPackage}`;
    try {
      await Linking.openURL(storeUrl);
    } catch {
      Linking.openURL(webUrl).catch(() =>
        Alert.alert('Unable to open platform', 'Please open the ride-hailing app manually.')
      );
    }
  }
}

function WelcomeScreen({ onContinue }) {
  return (
    <ScrollView contentContainerStyle={styles.welcomePage}>
      <View style={styles.logo}><Text style={styles.logoText}>e</Text></View>
      <Text style={styles.welcomeTitle}>eLingkod</Text>
      <Text style={styles.welcomeSubtitle}>Your commute, in one place</Text>
      <Text style={styles.intro}>A quick guide to planning a ride, comparing fares, and keeping track of your commute.</Text>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Plan and compare a commute</Text>
        <Text style={styles.guideStepTitle}>1. Choose your route</Text>
        <Text style={styles.bodyText}>Open the bottom sheet, enter a destination, and tap Go. Your pickup starts at Current Location when available; you can edit it.</Text>
        <Text style={styles.guideStepTitle}>2. Review the map and fares</Text>
        <Text style={styles.bodyText}>See the pickup and destination pins, route estimate, and fare comparisons for Angkas, Move It, and JoyRide. Traffic colors are simulated, not live.</Text>
        <Text style={styles.guideStepTitle}>3. Continue with a ride-hailing app</Text>
        <Text style={styles.bodyText}>Choose a provider to open its app or website and continue booking there.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>More ways to use eLingkod</Text>
        <Text style={styles.guideStepTitle}>Share commuter feedback</Text>
        <Text style={styles.bodyText}>Add a fare report or ride experience to help other commuters compare.</Text>
        <Text style={styles.guideStepTitle}>Use Commuter PRO</Text>
        <Text style={styles.bodyText}>Log paid fares, review commute insights, and set a class-time departure reminder. Your read-only fare history is available in Profile.</Text>
      </View>
      <Pressable onPress={onContinue} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>Got It</Text>
      </Pressable>
    </ScrollView>
  );
}

function SwipeableBottomSheet({ expanded, onChangeExpanded, children, footer }) {
  const startYRef = useRef(expanded ? EXPANDED_OFFSET : COLLAPSED_OFFSET);
  const translateY = useRef(
    new Animated.Value(expanded ? EXPANDED_OFFSET : COLLAPSED_OFFSET)
  ).current;

  useEffect(() => {
    const toValue = expanded ? EXPANDED_OFFSET : COLLAPSED_OFFSET;
    startYRef.current = toValue;
    Animated.spring(translateY, {
      toValue,
      useNativeDriver: true,
      damping: 22,
      stiffness: 180,
      mass: 0.9,
    }).start();
  }, [expanded, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dy) > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        },
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            startYRef.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const nextY = startYRef.current + gestureState.dy;
          const clampedY = Math.max(EXPANDED_OFFSET, Math.min(COLLAPSED_OFFSET + 40, nextY));
          translateY.setValue(clampedY);
        },
        onPanResponderRelease: (_, gestureState) => {
          const currentY = startYRef.current + gestureState.dy;
          const midpoint = (EXPANDED_OFFSET + COLLAPSED_OFFSET) / 2;

          const shouldExpand =
            gestureState.vy < -0.5 ||
            (gestureState.vy <= 0.5 && currentY < midpoint);

          onChangeExpanded(shouldExpand);
        },
      }),
    [onChangeExpanded, translateY]
  );

  return (
    <Animated.View
      style={[
        styles.animatedSheet,
        {
          height: SCREEN_HEIGHT - 95,
          transform: [{ translateY }],
        },
      ]}
    >
      <View {...panResponder.panHandlers} style={styles.dragHandleWrap}>
        <Pressable onPress={() => onChangeExpanded(!expanded)} style={styles.dragHandleHitbox}>
          <View style={styles.dragHandle} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>{children}</View>
      {footer || null}
    </Animated.View>
  );
}

function HomeMapSheetScreen({
  onNavigate,
  userReports,
  onAddReport,
  onRouteEstimate,
}) {
  const mapRef = useRef(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [userCoords, setUserCoords] = useState(USTP_COORDS);
  const [hasLiveFix, setHasLiveFix] = useState(false);
  const [locStatus, setLocStatus] = useState('Locating you…');
  const [origin, setOrigin] = useState('Current Location');
  const [destination, setDestination] = useState('');
  const [routeEstimate, setRouteEstimate] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('All');
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportPlatform, setReportPlatform] = useState('Move It');
  const [reportFare, setReportFare] = useState('');
  const [reportFeedback, setReportFeedback] = useState('');

  const focusMapOn = useCallback((coords) => {
    mapRef.current?.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      },
      500
    );
  }, []);

  const refreshLiveLocation = useCallback(
    async (shouldFocusMap = true) => {
      try {
        setLocStatus('Updating location…');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setHasLiveFix(false);
          setLocStatus('Permission off · USTP CDO default');
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const nextCoords = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };
        setUserCoords(nextCoords);
        setHasLiveFix(true);
        setLocStatus('Live location active');
        setOrigin('Current Location');
        if (shouldFocusMap) {
          focusMapOn(nextCoords);
        }
      } catch {
        setHasLiveFix(false);
        setLocStatus('Location unavailable · using USTP CDO');
      }
    },
    [focusMapOn]
  );

  useEffect(() => {
    let subscription;
    (async () => {
      await refreshLiveLocation(true);
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 15,
            timeInterval: 5000,
          },
          (pos) => {
            const nextCoords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            setUserCoords(nextCoords);
            setHasLiveFix(true);
            setLocStatus('Live location active');
          }
        );
      }
    })();

    return () => {
      subscription?.remove();
    };
  }, [refreshLiveLocation]);

  const runRouteSearch = useCallback(async (fromText, toText) => {
    if (!fromText.trim() || !toText.trim()) return;
    setLoadingRoute(true);
    setSheetExpanded(true);
    try {
      const [originCoords, destinationCoords] = await Promise.all([
        hasLiveFix && fromText.trim() === origin.trim()
          ? Promise.resolve(userCoords)
          : resolveLocationCoordinates(fromText),
        resolveLocationCoordinates(toText),
      ]);
      if (!originCoords || !destinationCoords) {
        Alert.alert(
          'Location not found',
          'Check the pickup and destination names, or include a nearby city such as Cagayan de Oro.'
        );
        return;
      }

      const result = createSimulatedTrafficRoute(
        fromText,
        toText,
        originCoords,
        destinationCoords
      );
      result.routeLabel = `${fromText.trim()} → ${toText.trim()}`;
      setRouteEstimate(result);
      onRouteEstimate?.(result);
      setSheetExpanded(false);
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(result.routeCoordinates, {
          edgePadding: {
            top: 150,
            right: 48,
            bottom: Math.round(SCREEN_HEIGHT * 0.48),
            left: 48,
          },
          animated: true,
        });
      }, 250);
    } finally {
      setLoadingRoute(false);
    }
  }, [hasLiveFix, origin, userCoords, onRouteEstimate]);

  const handleSelectQuickDestination = (destItem) => {
    setDestination(destItem.title);
    runRouteSearch(origin, destItem.title);
  };

  const scaleFactor = useMemo(() => {
    if (!routeEstimate) return 1;
    return Math.max(0.85, Math.min(1.6, routeEstimate.distanceKm / 1.8));
  }, [routeEstimate]);

  const comparisonRows = useMemo(() => {
    return PLATFORMS.map((platform) => {
      const base = INITIAL_FARE_BENCHMARKS[platform];
      const reports = userReports.filter((r) => r.platform === platform);
      const avgReported =
        reports.length > 0
          ? Math.round(reports.reduce((sum, r) => sum + Number(r.fare), 0) / reports.length)
          : null;
      return {
        platform,
        estLow: Math.round(base.min * scaleFactor),
        estHigh: Math.round(base.max * scaleFactor),
        avgReported,
        reportCount: reports.length,
        sourceLabel: base.sourceLabel,
      };
    });
  }, [scaleFactor, userReports]);

  const filteredReports = useMemo(() => {
    if (platformFilter === 'All') return userReports;
    return userReports.filter((r) => r.platform === platformFilter);
  }, [platformFilter, userReports]);

  const handleRedirect = (platformName) => {
    Alert.alert(
      `Open ${platformName}`,
      `eLingkod will redirect you to ${platformName} to check live rider availability, confirm exact pricing, and complete your booking.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Open ${platformName}`, onPress: () => redirectToPlatform(platformName) },
      ]
    );
  };

  const handleSaveReport = () => {
    const parsedFare = Number(reportFare);
    if (!Number.isFinite(parsedFare) || parsedFare < 20 || parsedFare > 1000) {
      Alert.alert('Invalid fare', 'Enter a valid fare between ₱20 and ₱1,000.');
      return;
    }
    const routeLabel = destination.trim()
      ? `${origin.trim()} → ${destination.trim()}`
      : 'USTP CDO → Cagayan de Oro';

    onAddReport({
      id: `rep-${Date.now()}`,
      platform: reportPlatform,
      fare: Math.round(parsedFare),
      route: routeLabel,
      feedback: reportFeedback.trim() || 'Logged commuter fare report.',
      date: new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
      source: 'User-reported',
    });
    setReportFare('');
    setReportFeedback('');
    setReportModalVisible(false);
  };

  const recentReport = userReports[0];

  return (
    <View style={styles.fullScreen}>
      {/* FULL-SCREEN LIVE MAP BACKGROUND */}
      <MapView
        ref={mapRef}
        style={styles.homeMapViewport}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        mapType="standard"
        loadingEnabled
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={{
          latitude: USTP_COORDS.latitude - 0.004,
          longitude: USTP_COORDS.longitude - 0.002,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        <Marker
          coordinate={routeEstimate?.originCoords ?? userCoords}
          title={routeEstimate ? `Pickup: ${origin}` : hasLiveFix ? 'You are here' : 'USTP CDO reference'}
          description={routeEstimate ? 'Route starting point' : locStatus}
          pinColor={colors.green}
        />
        {routeEstimate?.destinationCoords ? (
          <>
            <Marker
              coordinate={routeEstimate.destinationCoords}
              title={`Destination: ${destination}`}
              description={`~${routeEstimate.durationMin} min (${routeEstimate.distanceKm} km)`}
              pinColor="#1E293B"
            />
            {routeEstimate.routeSegments?.map((segment, index) => (
              <Polyline
                key={`traffic-${index}`}
                coordinates={segment.coordinates}
                strokeColor={segment.color}
                strokeWidth={6}
              />
            ))}
          </>
        ) : null}
      </MapView>

      {routeEstimate?.routeSegments?.length ? (
        <View
          pointerEvents="none"
          style={[styles.trafficLegend, { bottom: 105 + COLLAPSED_OFFSET }]}
        >
          <Text style={styles.trafficLegendTitle}>SIMULATED TRAFFIC</Text>
          <View style={styles.trafficLegendItems}>
            {[
              { label: 'Light', color: '#22A06B' },
              { label: 'Moderate', color: '#F59E0B' },
              { label: 'Heavy', color: '#E5484D' },
            ].map((item) => (
              <View key={item.label} style={styles.trafficLegendItem}>
                <View style={[styles.trafficLegendDot, { backgroundColor: item.color }]} />
                <Text style={styles.trafficLegendLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* FLOATING TOP BADGE + RECENTER BUTTON */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.topPill}>
          <View style={styles.liveDot} />
          <Text style={styles.topPillText}>{locStatus}</Text>
        </View>
        <View style={styles.rowInline}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Center map on my location"
            onPress={() => refreshLiveLocation(true)}
            style={styles.myLocationBtn}
          >
            <Text style={styles.myLocationText}>⌖</Text>
          </Pressable>
          {sheetExpanded ? (
            <Pressable
              onPress={() => setSheetExpanded(false)}
              style={styles.collapseMapBtn}
            >
              <Text style={styles.collapseMapText}>Map</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* SWIPEABLE BOTTOM WINDOW SHEET */}
      <SwipeableBottomSheet
        expanded={sheetExpanded}
        onChangeExpanded={setSheetExpanded}
        footer={<BottomNavigation active="Home" onNavigate={onNavigate} />}
      >
        {!sheetExpanded ? (
          <View style={styles.compactSheetBody}>
            <Text style={styles.greetingText}>Maayong adlaw, Commuter</Text>
            <Text style={styles.headlineText}>Where are you headed?</Text>

            <Pressable
              onPress={() => setSheetExpanded(true)}
              style={styles.destinationPill}
            >
              <Text style={styles.searchIcon}>⌕</Text>
              <Text style={styles.destinationPillText} numberOfLines={1}>
                {destination.trim() ? destination : 'Enter destination'}
              </Text>
              <View style={styles.timeBadge}>
                <Text style={styles.timeBadgeText}>◷ Now ⌄</Text>
              </View>
            </Pressable>

            <View style={styles.quickCardsRow}>
              {DESTINATIONS.slice(0, 2).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => handleSelectQuickDestination(item)}
                  style={styles.quickPlaceCard}
                >
                  <View style={styles.quickPlaceIconBox}>
                    <Text style={styles.quickPlaceIcon}>{item.id === 'sm-downtown' ? '⌂' : 'Brief'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quickPlaceTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.quickPlaceSub}>{item.fallbackMin} min away</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <View style={styles.recentHeader}>
              <Text style={styles.recentLabel}>RECENT USER REPORT</Text>
              <Pressable onPress={() => setSheetExpanded(true)}>
                <Text style={styles.seeAllText}>Compare all</Text>
              </Pressable>
            </View>

            {recentReport ? (
              <Pressable
                onPress={() => setSheetExpanded(true)}
                style={styles.recentRow}
              >
                <View style={styles.recentIconCircle}>
                  <Text style={styles.recentIcon}>↺</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentTitle} numberOfLines={1}>{recentReport.route}</Text>
                  <Text style={styles.recentSub} numberOfLines={1}>
                    {recentReport.platform} · ₱{recentReport.fare} ({recentReport.source})
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.expandedSheetContent}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.expandedTitle}>Compare Ride Options</Text>
              <Pressable onPress={() => setSheetExpanded(false)}>
                <Text style={styles.seeAllText}>Minimize ⌄</Text>
              </Pressable>
            </View>

            <TextInput
              placeholder="Pickup (e.g., USTP CDO)"
              placeholderTextColor={colors.muted}
              value={origin}
              onChangeText={setOrigin}
              style={styles.inputField}
            />
            <View style={styles.destInputRow}>
              <TextInput
                placeholder="Where to? (e.g., SM Downtown, Limketkai)"
                placeholderTextColor={colors.muted}
                value={destination}
                onChangeText={setDestination}
                style={[styles.inputField, { flex: 1 }]}
                returnKeyType="search"
                onSubmitEditing={() => runRouteSearch(origin, destination)}
              />
              <Pressable
                onPress={() => runRouteSearch(origin, destination)}
                style={styles.goBtn}
              >
                <Text style={styles.goBtnText}>{loadingRoute ? '...' : 'Go'}</Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {DESTINATIONS.map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => handleSelectQuickDestination(d)}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{d.title}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {routeEstimate ? (
              <View style={styles.routeSummaryBox}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eyebrow}>SIMULATED ROUTE & TRAFFIC</Text>
                  <Text style={styles.routeTimeHeadline}>
                    ~{routeEstimate.durationMin} min · {routeEstimate.distanceKm} km
                  </Text>
                  <Text style={styles.smallMuted}>{routeEstimate.source}</Text>
                </View>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Estimated Fares & App Redirection</Text>
            {comparisonRows.map((row) => (
              <View key={row.platform} style={styles.compareCard}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.rowInline}>
                    <View style={[styles.dot, { backgroundColor: platformColor(row.platform) }]} />
                    <Text style={styles.providerTitle}>{row.platform}</Text>
                  </View>
                  <Text style={styles.fareText}>
                    Est. ₱{row.estLow}–₱{row.estHigh}
                    {row.avgReported ? ` · Avg user report: ₱${row.avgReported}` : ''}
                  </Text>
                  <Text style={styles.smallMuted}>
                    {row.sourceLabel} · {row.reportCount} user {row.reportCount === 1 ? 'report' : 'reports'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleRedirect(row.platform)}
                  style={styles.openAppBtn}
                >
                  <Text style={styles.openAppBtnText}>Open App</Text>
                </Pressable>
              </View>
            ))}

            <View style={[styles.rowBetween, { marginTop: 6 }]}>
              <Text style={styles.sectionTitle}>User-Reported Prices & Feedback</Text>
              <Pressable onPress={() => setReportModalVisible(true)}>
                <Text style={styles.seeAllText}>+ Add report</Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {['All', ...PLATFORMS].map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setPlatformFilter(item)}
                  style={[styles.chip, platformFilter === item && styles.chipActive]}
                >
                  <Text style={[styles.chipText, platformFilter === item && styles.chipTextActive]}>
                    {item}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {filteredReports.map((rep) => (
              <View key={rep.id} style={styles.feedbackCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.providerTitle}>{rep.platform} · ₱{rep.fare}</Text>
                  <Text style={styles.sourceBadge}>{rep.source}</Text>
                </View>
                <Text style={styles.smallMuted}>{rep.route} · {rep.date}</Text>
                <Text style={styles.bodyText}>{rep.feedback}</Text>
              </View>
            ))}

            <Text style={styles.disclaimerText}>
              Prices are estimates or user-reported experiences. Bookings and payments occur inside your selected ride-hailing app.
            </Text>
          </ScrollView>
        )}
      </SwipeableBottomSheet>

      {/* ADD USER FEEDBACK / PRICE MODAL */}
      <Modal
        transparent
        visible={reportModalVisible}
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Share Fare & Ride Feedback</Text>
            <View style={styles.rowInline}>
              {PLATFORMS.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setReportPlatform(p)}
                  style={[styles.chip, reportPlatform === p && styles.chipActive]}
                >
                  <Text style={[styles.chipText, reportPlatform === p && styles.chipTextActive]}>{p}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              placeholder="Fare paid or quoted (₱)"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={reportFare}
              onChangeText={setReportFare}
              style={styles.inputField}
            />
            <TextInput
              placeholder="Ride experience feedback (e.g., wait time, safety, route)"
              placeholderTextColor={colors.muted}
              value={reportFeedback}
              onChangeText={setReportFeedback}
              style={[styles.inputField, { minHeight: 70 }]}
              multiline
            />
            <Pressable onPress={handleSaveReport} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>SAVE REPORT</Text>
            </Pressable>
            <Pressable onPress={() => setReportModalVisible(false)} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>CANCEL</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ProScreen({ onNavigate, routeEstimate }) {
  const [isPro, setIsPro] = useState(false);
  const [proData, setProData] = useState({ entries: [], planner: null, voucherSaved: false });
  const [storageReady, setStorageReady] = useState(false);
  const [fareAmount, setFareAmount] = useState('');
  const [fareRoute, setFareRoute] = useState('');
  const [classArrival, setClassArrival] = useState('08:00');
  const [proFeaturesExpanded, setProFeaturesExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [active, savedTools] = await Promise.all([
          AsyncStorage.getItem(PRO_ACTIVE_KEY),
          AsyncStorage.getItem(PRO_TOOLS_STORAGE_KEY),
        ]);
        setIsPro(active === 'true');
        if (savedTools) {
          const parsed = JSON.parse(savedTools);
          setProData({
            entries: Array.isArray(parsed.entries) ? parsed.entries : [],
            planner: parsed.planner ?? null,
            voucherSaved: Boolean(parsed.voucherSaved),
          });
          if (parsed.planner) {
            setClassArrival(parsed.planner.classArrival ?? '08:00');
          }
        }
      } catch {
        // Keep local previews usable if stored prototype data cannot be read.
      } finally {
        setStorageReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (storageReady) {
      AsyncStorage.setItem(PRO_TOOLS_STORAGE_KEY, JSON.stringify(proData)).catch(() => {});
    }
  }, [proData, storageReady]);

  const proFeatures = [
    {
      icon: '◷',
      title: 'Suggested commute times',
      description: 'Plan when to leave using your usual routes and commute patterns.',
      previewLabel: 'SAMPLE WEEKDAY',
      previewRows: ['7:15 AM · Usually lighter', '7:45 AM · Typical commute', '8:10 AM · Often busier'],
    },
    {
      icon: '↗',
      title: 'Personal insights',
      description: 'Review your commute habits, fare trends, and time-saving patterns.',
      previewLabel: 'SAMPLE WEEKLY INSIGHT',
      previewRows: ['4 trips tracked · ₱62 average fare', 'Fastest sample trip · Tuesday, 7:20 AM'],
    },
    {
      icon: '◇',
      title: 'Commuter vouchers',
      description: 'Find partner offers and discounts for your next ride.',
      previewLabel: 'SAMPLE OFFER',
      previewRows: ['₱20 off a ride · Partner voucher', 'Offers appear here when available'],
    },
    {
      icon: '₱',
      title: 'Commute budget tracker',
      description: '',
      previewLabel: 'SAMPLE SPENDING SUMMARY',
      previewRows: ['This week · ₱620 across 8 rides', 'This month · ₱2,480', 'USTP → Limketkai · ₱310 this week'],
    },
    {
      icon: '⌚',
      title: 'Class-time commute planner',
      description: 'Set your class arrival time and see a suggested departure with a traffic buffer.',
      previewLabel: 'SAMPLE CLASS PLAN',
      previewRows: ['Class starts · 8:00 AM', 'Suggested departure · 7:20 AM', 'Reminder preview · 40 minutes before class'],
    },
  ];

  const now = Date.now();
  const thisWeekEntries = proData.entries.filter((entry) => now - entry.timestamp < 7 * 24 * 60 * 60 * 1000);
  const previousWeekEntries = proData.entries.filter((entry) => {
    const age = now - entry.timestamp;
    return age >= 7 * 24 * 60 * 60 * 1000 && age < 14 * 24 * 60 * 60 * 1000;
  });
  const thisMonthEntries = proData.entries.filter((entry) => {
    const date = new Date(entry.timestamp);
    const current = new Date(now);
    return date.getMonth() === current.getMonth() && date.getFullYear() === current.getFullYear();
  });
  const weeklyPaid = thisWeekEntries.filter((entry) => entry.type === 'Paid');
  const monthlyPaid = thisMonthEntries.filter((entry) => entry.type === 'Paid');
  const previousMonth = new Date(now);
  previousMonth.setDate(1);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const previousMonthPaid = proData.entries.filter((entry) => {
    if (entry.type !== 'Paid') return false;
    const date = new Date(entry.timestamp);
    return date.getMonth() === previousMonth.getMonth() && date.getFullYear() === previousMonth.getFullYear();
  });
  const weeklySpend = weeklyPaid.reduce((sum, entry) => sum + entry.amount, 0);
  const monthlySpend = monthlyPaid.reduce((sum, entry) => sum + entry.amount, 0);
  const previousWeekSpend = previousWeekEntries
    .filter((entry) => entry.type === 'Paid')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const previousMonthSpend = previousMonthPaid.reduce((sum, entry) => sum + entry.amount, 0);
  const averagePaidFare = weeklyPaid.length
    ? Math.round(weeklySpend / weeklyPaid.length)
    : 0;
  const routeTotals = weeklyPaid.reduce((totals, entry) => {
    totals[entry.route] = (totals[entry.route] ?? 0) + entry.amount;
    return totals;
  }, {});
  const highestSpendRoute = Object.entries(routeTotals).sort((a, b) => b[1] - a[1])[0];
  const topRoutes = Object.entries(routeTotals).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const spendingChangeLabel = (current, previous) => {
    if (previous === 0) return 'No earlier data';
    const change = Math.round(((current - previous) / previous) * 100);
    return `${change > 0 ? '+' : ''}${change}% vs prior period`;
  };

  const handleAddFare = () => {
    const amount = Number(fareAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      Alert.alert('Enter a fare', 'Add a valid quoted or paid fare amount.');
      return;
    }
    const entry = {
      id: `${Date.now()}`,
      amount: Math.round(amount),
      route: fareRoute.trim() || 'Usual commute route',
      type: 'Paid',
      timestamp: Date.now(),
    };
    setProData((current) => ({ ...current, entries: [entry, ...current.entries].slice(0, 100) }));
    setFareAmount('');
  };

  const calculateDeparture = () => {
    const timeMatch = classArrival.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch || Number(timeMatch[1]) > 23 || Number(timeMatch[2]) > 59) {
      Alert.alert('Check your class time', 'Enter a valid time like 08:00.');
      return;
    }
    if (!routeEstimate) {
      Alert.alert('Choose a commute route', 'Set your pickup and destination on the Home map first, then return here to calculate your departure reminder.');
      return;
    }

    const [hours, minutes] = timeMatch.slice(1).map(Number);
    const departure = new Date();
    departure.setHours(hours, minutes, 0, 0);
    departure.setMinutes(departure.getMinutes() - routeEstimate.durationMin);
    const departureTime = departure.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
    const planner = {
      classArrival: classArrival.trim(),
      tripMinutes: routeEstimate.durationMin,
      route: routeEstimate.routeLabel,
      distanceKm: routeEstimate.distanceKm,
      traffic: routeEstimate.trafficSummary,
      departureTime,
    };
    setProData((current) => ({ ...current, planner }));
    Alert.alert('Departure reminder saved', `For ${planner.route}, estimated travel time is ${planner.tripMinutes} minutes. Leave by ${departureTime}. This reminder is saved in the app; system notifications are not enabled.`);
  };

  const handleActivate = async () => {
    try {
      await AsyncStorage.setItem(PRO_ACTIVE_KEY, 'true');
      setIsPro(true);
    } catch {
      Alert.alert('Could not activate PRO', 'Storage is unavailable. Please try again.');
    }
  };

  const handleCancelPro = async () => {
    try {
      await AsyncStorage.setItem(PRO_ACTIVE_KEY, 'false');
      setIsPro(false);
      setProFeaturesExpanded(false);
    } catch {
      Alert.alert('Could not cancel Commuter PRO', 'Storage is unavailable. Please try again.');
    }
  };

  return (
    <View style={styles.fullScreen}>
      <ScrollView contentContainerStyle={styles.subPageContent}>
        <View style={styles.proHeading}>
          <Text style={styles.expandedTitle}>Commuter PRO</Text>
          <Text style={styles.proIntro}>Extra tools to make your regular commute easier to plan.</Text>
        </View>
        <View style={styles.proBanner}>
          <View style={styles.proBannerTop}>
            <Text style={styles.proBannerTag}>{isPro ? 'PRO IS ACTIVE' : 'PREMIUM PLAN PREVIEW'}</Text>
            <View style={styles.proCountPill}><Text style={styles.proCountText}>5 FEATURES</Text></View>
          </View>
          {isPro ? (
            <Text style={styles.proPrice}>PRO User <Text style={styles.proUnit}> </Text></Text>
          ) : (
            <Text style={styles.proPrice}>₱29<Text style={styles.proUnit}> / month</Text></Text>
          )}
          {!isPro ? <Text style={styles.proSub}>Per Month</Text> : null}
        </View>
        {!isPro ? (
          <Pressable
            onPress={() => Alert.alert(
              'Buy Commuter PRO?',
              'This prototype will activate the listed PRO tools without collecting payment.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Confirm & activate', onPress: handleActivate },
              ]
            )}
            style={styles.proBuyButton}
          >
            <Text style={styles.proBuyButtonText}>Buy Commuter PRO · ₱29/month</Text>
          </Pressable>
        ) : null}
        {isPro ? (
          <View style={styles.proFeatureDropdown}>
            <Pressable
              onPress={() => setProFeaturesExpanded((expanded) => !expanded)}
              style={styles.proFeatureDropdownHeader}
            >
              <Text style={styles.proSectionHeading}>Your PRO features</Text>
              <Text style={styles.proFeatureDropdownToggle}>{proFeaturesExpanded ? '⌃' : '⌄'}</Text>
            </Pressable>
            {proFeaturesExpanded ? proFeatures.map((feature) => (
              <View key={feature.title} style={styles.proActiveFeatureRow}>
                <View style={styles.proFeatureIcon}><Text style={styles.proFeatureIconText}>{feature.icon}</Text></View>
                <Text style={styles.proFeatureTitle}>{feature.title}</Text>
                <Text style={styles.proActiveFeatureCheck}>✓</Text>
              </View>
            )) : null}
          </View>
        ) : (
          <>
            <Text style={styles.proSectionHeading}>Included with PRO</Text>
            {proFeatures.map((feature, index) => (
          <View key={feature.title} style={styles.proFeatureCard}>
            <View style={styles.proFeatureHeader}>
              <View style={styles.proFeatureIcon}><Text style={styles.proFeatureIconText}>{feature.icon}</Text></View>
              <View style={styles.proFeatureCopy}>
                <View style={styles.proFeatureTitleRow}>
                  <Text style={styles.proFeatureTitle}>{feature.title}</Text>
                  <Text style={styles.proFeatureNumber}>0{index + 1}</Text>
                </View>
                <Text style={styles.bodyText}>{feature.description}</Text>
              </View>
            </View>
            <View style={styles.proPreviewBox}>
              <Text style={styles.proPreviewLabel}>{feature.previewLabel}</Text>
              {feature.previewRows.map((row) => (
                <Text key={row} style={styles.proPreviewRow}>{row}</Text>
              ))}
            </View>
          </View>
            ))}
          </>
        )}
        {isPro ? (
          <>
            <Text style={styles.proSectionHeading}>Your PRO tools</Text>
            <View style={styles.proFeatureCard}>
              <Text style={styles.proFeatureTitle}>Commute budget tracker</Text>
              <View style={styles.proMetricsRow}>
                <View style={styles.proMetric}><Text style={styles.proMetricLabel}>PAID · 7 DAYS</Text><Text style={styles.proMetricValue}>₱{weeklySpend}</Text><Text style={styles.proMetricTrend}>{spendingChangeLabel(weeklySpend, previousWeekSpend)}</Text></View>
                <View style={styles.proMetric}><Text style={styles.proMetricLabel}>PAID · THIS MONTH</Text><Text style={styles.proMetricValue}>₱{monthlySpend}</Text><Text style={styles.proMetricTrend}>{spendingChangeLabel(monthlySpend, previousMonthSpend)}</Text></View>
              </View>
              <Text style={styles.smallMuted}>Average paid fare this week: ₱{averagePaidFare}</Text>
              {highestSpendRoute ? <Text style={styles.smallMuted}>Highest weekly spend: {highestSpendRoute[0]} · ₱{highestSpendRoute[1]}</Text> : null}
              {topRoutes.length ? <View style={styles.proRouteTrend}><Text style={styles.proMetricLabel}>WEEKLY SPEND BY ROUTE</Text>{topRoutes.map(([route, amount]) => <Text key={route} style={styles.proPreviewRow}>{route} · ₱{amount}</Text>)}</View> : null}
              <TextInput
                placeholder="Fare amount (₱)"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={fareAmount}
                onChangeText={setFareAmount}
                style={styles.inputField}
              />
              <TextInput
                placeholder="Route (e.g. USTP → Limketkai)"
                placeholderTextColor={colors.muted}
                value={fareRoute}
                onChangeText={setFareRoute}
                style={styles.inputField}
              />
              <Pressable onPress={handleAddFare} style={styles.proSmallAction}><Text style={styles.proSmallActionText}>Add paid fare</Text></Pressable>
              {proData.entries.slice(0, 4).map((entry) => (
                <View key={entry.id} style={styles.proLogRow}>
                  <View style={{ flex: 1 }}><Text style={styles.proLogRoute}>{entry.route}</Text><Text style={styles.smallMuted}>{entry.type} · {new Date(entry.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</Text></View>
                  <Text style={styles.proLogAmount}>₱{entry.amount}</Text>
                </View>
              ))}
            </View>

            <View style={styles.proFeatureCard}>
              <Text style={styles.proFeatureTitle}>Personal commute insights</Text>
              <Text style={styles.bodyText}>Insights are calculated from the fares you log in this app.</Text>
              {weeklyPaid.length ? (
                <View style={styles.proMetricsRow}>
                  <View style={styles.proMetric}><Text style={styles.proMetricLabel}>PAID FARES · 7 DAYS</Text><Text style={styles.proMetricValue}>{weeklyPaid.length}</Text></View>
                  <View style={styles.proMetric}><Text style={styles.proMetricLabel}>AVERAGE FARE</Text><Text style={styles.proMetricValue}>₱{averagePaidFare}</Text></View>
                </View>
              ) : <Text style={styles.smallMuted}>Log a few paid fares to see your average and route patterns here.</Text>}
              {highestSpendRoute ? <Text style={styles.proPlannerResult}>Your highest-spend route this week is {highestSpendRoute[0]} at ₱{highestSpendRoute[1]}.</Text> : null}
            </View>

            <View style={styles.proFeatureCard}>
              <Text style={styles.proFeatureTitle}>Class-time commute planner</Text>
              <Text style={styles.proMetricLabel}>CLASS START TIME</Text>
              <TextInput value={classArrival} onChangeText={setClassArrival} placeholder="08:00" style={styles.inputField} />
              {routeEstimate ? (
                <View style={styles.proPlannerResult}>
                  <Text style={styles.proPreviewLabel}>CURRENT ROUTE · SIMULATED TRAFFIC</Text>
                  <Text style={styles.proFeatureTitle}>{routeEstimate.routeLabel}</Text>
                  <Text style={styles.bodyText}>Estimated travel: ~{routeEstimate.durationMin} min · {routeEstimate.distanceKm} km</Text>
                  <Text style={styles.smallMuted}>Traffic indicators: {routeEstimate.trafficSummary}. Not live traffic.</Text>
                </View>
              ) : (
                <Text style={styles.smallMuted}>Choose your pickup and destination on the Home map to see a route estimate here.</Text>
              )}
              <Pressable onPress={calculateDeparture} style={styles.proSmallAction}><Text style={styles.proSmallActionText}>Calculate & save reminder</Text></Pressable>
              {proData.planner ? <Text style={styles.proPlannerResult}>Leave by {proData.planner.departureTime} for your {proData.planner.classArrival} class. Estimated travel: {proData.planner.tripMinutes} min on {proData.planner.route}{proData.planner.traffic ? ` · ${proData.planner.traffic} traffic` : ''}.</Text> : null}
              <Text style={styles.smallMuted}>Reminder is saved in the app; system notifications are not enabled.</Text>
            </View>

            <View style={styles.proFeatureCard}>
              <Text style={styles.proFeatureTitle}>Commuter voucher preview</Text>
              <Text style={styles.bodyText}>Demo-only offer. It is not redeemable with ride-hailing partners.</Text>
              <View style={styles.proVoucherPreview}>
                <Text style={styles.proPreviewLabel}>SAMPLE VOUCHER</Text>
                <Text style={styles.proVoucherAmount}>₱20 off a ride</Text>
                <Text style={styles.smallMuted}>Code: CDO-COMMUTE-20</Text>
              </View>
              <Pressable
                onPress={() => setProData((current) => ({ ...current, voucherSaved: !current.voucherSaved }))}
                style={styles.proSmallAction}
              >
                <Text style={styles.proSmallActionText}>{proData.voucherSaved ? 'Voucher saved' : 'Save sample voucher'}</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => Alert.alert(
                'Cancel Commuter PRO?',
                'Your PRO tools will be locked again. You can buy the plan later to reactivate them.',
                [
                  { text: 'Keep PRO', style: 'cancel' },
                  { text: 'Cancel PRO', style: 'destructive', onPress: handleCancelPro },
                ]
              )}
              style={styles.proCancelButton}
            >
              <Text style={styles.proCancelButtonText}>Cancel Commuter PRO</Text>
            </Pressable>
          </>
        ) : null}
        <View style={styles.proFooterNote}>
          <Text style={styles.proFooterTitle}>Plan preview</Text>
          <Text style={styles.smallMuted}>{isPro ? 'PRO is activated locally for this prototype. No payment was collected.' : 'These examples are sample previews. Buying activates demo features without collecting payment.'}</Text>
        </View>
      </ScrollView>
      <BottomNavigation active="Commuter PRO" onNavigate={onNavigate} />
    </View>
  );
}

function ProfileScreen({ onNavigate, onGuide, reportCount }) {
  const [commuteHistory, setCommuteHistory] = useState([]);
  const [subscriptionActive, setSubscriptionActive] = useState(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      AsyncStorage.getItem(PRO_TOOLS_STORAGE_KEY),
      AsyncStorage.getItem(PRO_ACTIVE_KEY),
    ]).then(([saved, active]) => {
      if (!isMounted) return;
      if (saved) {
        const parsed = JSON.parse(saved);
        const entries = Array.isArray(parsed.entries)
          ? parsed.entries.filter((entry) => entry && Number.isFinite(Number(entry.amount)) && Number.isFinite(Number(entry.timestamp)))
          : [];
        setCommuteHistory(entries);
      }
      setSubscriptionActive(active === 'true');
    }).catch(() => {
      if (isMounted) setSubscriptionActive(false);
    });
    return () => { isMounted = false; };
  }, []);

  const paidHistory = commuteHistory.filter((entry) => entry.type === 'Paid');
  const lifetimeSpend = paidHistory.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const averageFare = paidHistory.length ? Math.round(lifetimeSpend / paidHistory.length) : 0;
  const routeHistory = paidHistory.reduce((routes, entry) => {
    const route = entry.route || 'Usual commute route';
    if (!routes[route]) routes[route] = { trips: 0, spend: 0 };
    routes[route].trips += 1;
    routes[route].spend += Number(entry.amount);
    return routes;
  }, {});
  const usualRoute = Object.entries(routeHistory).sort((a, b) => b[1].trips - a[1].trips)[0];

  const openApplicationSettings = async () => {
    if (typeof Linking.openSettings !== 'function') {
      Alert.alert('Application settings', 'Open your device Settings app to manage eLingkod permissions.');
      return;
    }
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert('Application settings', 'Open your device Settings app to manage eLingkod permissions.');
    }
  };

  return (
    <View style={styles.fullScreen}>
      <ScrollView contentContainerStyle={styles.subPageContent}>
        <Text style={styles.expandedTitle}>Account</Text>
        <View style={[styles.card, { alignItems: 'center', paddingVertical: 20 }]}>
          <View style={styles.avatar}><Text style={styles.avatarText}>U</Text></View>
          <Text style={styles.providerTitle}>USTP Student Commuter</Text>
          <Text style={styles.smallMuted}>{reportCount} user fare reports saved locally</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.providerTitle}>Subscription status</Text>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bodyText}>{subscriptionActive === null ? 'Checking status…' : subscriptionActive ? 'Commuter PRO' : 'Free plan'}</Text>
              <Text style={styles.smallMuted}>{subscriptionActive ? 'PRO features are active on this device.' : 'Commuter PRO features are locked.'}</Text>
            </View>
            <View style={[styles.subscriptionStatusPill, subscriptionActive && styles.subscriptionStatusPillActive]}>
              <Text style={[styles.subscriptionStatusText, subscriptionActive && styles.subscriptionStatusTextActive]}>{subscriptionActive === null ? '…' : subscriptionActive ? 'ACTIVE' : 'FREE'}</Text>
            </View>
          </View>
          <Pressable onPress={() => onNavigate('pro')} style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: colors.line }]}>
            <Text style={styles.bodyText}>Manage Commuter PRO</Text>
            <Text style={styles.seeAllText}>›</Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          <Text style={styles.providerTitle}>Commute history</Text>
          <Text style={styles.smallMuted}>Read-only records and insights from your Commuter PRO budget tracker.</Text>
          {paidHistory.length ? (
            <>
              <View style={styles.proMetricsRow}>
                <View style={styles.proMetric}>
                  <Text style={styles.proMetricLabel}>TOTAL PAID</Text>
                  <Text style={styles.proMetricValue}>₱{lifetimeSpend}</Text>
                </View>
                <View style={styles.proMetric}>
                  <Text style={styles.proMetricLabel}>PAID FARES</Text>
                  <Text style={styles.proMetricValue}>{paidHistory.length}</Text>
                </View>
                <View style={styles.proMetric}>
                  <Text style={styles.proMetricLabel}>AVERAGE</Text>
                  <Text style={styles.proMetricValue}>₱{averageFare}</Text>
                </View>
              </View>
              {usualRoute ? (
                <View style={styles.proPlannerResult}>
                  <Text style={styles.proPreviewLabel}>PERSONAL COMMUTE INSIGHT</Text>
                  <Text style={styles.proPreviewRow}>Most logged route: {usualRoute[0]}</Text>
                  <Text style={styles.proPreviewRow}>{usualRoute[1].trips} paid trips · ₱{usualRoute[1].spend} total</Text>
                </View>
              ) : null}
              <Text style={styles.proMetricLabel}>RECENT FARES</Text>
              {[...commuteHistory]
                .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
                .slice(0, 6)
                .map((entry) => (
                  <View key={entry.id ?? `${entry.timestamp}-${entry.route}`} style={styles.proLogRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.proLogRoute}>{entry.route || 'Usual commute route'}</Text>
                      <Text style={styles.smallMuted}>{entry.type || 'Paid'} · {new Date(Number(entry.timestamp)).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                    </View>
                    <Text style={styles.proLogAmount}>₱{Number(entry.amount)}</Text>
                  </View>
                ))}
            </>
          ) : (
            <Text style={styles.smallMuted}>No fares logged yet. Your budget history and commute insights will appear here after you add fares in Commuter PRO.</Text>
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.providerTitle}>Settings & information</Text>
          <Pressable onPress={openApplicationSettings} style={styles.settingRow}>
            <View style={{ flex: 1 }}><Text style={styles.bodyText}>Application settings</Text><Text style={styles.smallMuted}>Manage eLingkod device permissions</Text></View>
            <Text style={styles.seeAllText}>›</Text>
          </Pressable>
          <Pressable
            onPress={() => Alert.alert('Notifications', 'Class departure reminders are saved in the app. System notifications are not enabled in this version.')}
            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: colors.line }]}
          >
            <View style={{ flex: 1 }}><Text style={styles.bodyText}>Notifications</Text><Text style={styles.smallMuted}>Class reminders are saved in-app</Text></View>
            <Text style={styles.seeAllText}>›</Text>
          </Pressable>
          <Pressable onPress={onGuide} style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: colors.line }]}>
            <View style={{ flex: 1 }}><Text style={styles.bodyText}>User guide</Text><Text style={styles.smallMuted}>Learn how to plan and compare a commute</Text></View>
            <Text style={styles.seeAllText}>›</Text>
          </Pressable>
          <Pressable
            onPress={() => Alert.alert('Privacy information', 'Fare reports and Commuter PRO tracker data are saved on this device. Location is used to show your current pickup when permission is available. Traffic indicators are simulated.')}
            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: colors.line }]}
          >
            <View style={{ flex: 1 }}><Text style={styles.bodyText}>Privacy information</Text><Text style={styles.smallMuted}>How eLingkod uses location and saved data</Text></View>
            <Text style={styles.seeAllText}>›</Text>
          </Pressable>
          <Pressable
            onPress={() => Alert.alert('About eLingkod', 'eLingkod compares motorcycle ride-hailing estimates, simulated traffic, and user-reported feedback, then lets you open Angkas, Move It, or JoyRide.')}
            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: colors.line }]}
          >
            <Text style={styles.bodyText}>About eLingkod</Text>
            <Text style={styles.seeAllText}>›</Text>
          </Pressable>
        </View>
      </ScrollView>
      <BottomNavigation active="Profile" onNavigate={onNavigate} />
    </View>
  );
}

function BottomNavigation({ active, onNavigate }) {
  const items = [
    { key: 'home', label: 'Compare', icon: '⌕' },
    { key: 'pro', label: 'Commuter PRO', icon: '▤' },
    { key: 'profile', label: 'Account', icon: '○' },
  ];
  const activeKey = active === 'Home' ? 'home' : active === 'Profile' ? 'profile' : 'pro';

  return (
    <View style={styles.bottomNav}>
      {items.map((item) => {
        const isActive = activeKey === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => onNavigate(item.key)}
            style={styles.navItem}
          >
            <View style={[styles.navPill, isActive && styles.navPillActive]}>
              <Text style={[styles.navIcon, isActive && styles.navIconActive]}>{item.icon}</Text>
            </View>
            <Text numberOfLines={1} style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [guideReturn, setGuideReturn] = useState('home');
  const [userReports, setUserReports] = useState(INITIAL_USER_REPORTS);
  const [activeRouteEstimate, setActiveRouteEstimate] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [seen, saved] = await Promise.all([
          AsyncStorage.getItem(FIRST_LAUNCH_KEY),
          AsyncStorage.getItem(REPORTS_STORAGE_KEY),
        ]);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) setUserReports(parsed);
        }
        setScreen(seen === 'true' ? 'home' : 'guide');
      } catch {
        setScreen('guide');
      }
    })();
  }, []);

  const handleAddReport = useCallback((newReport) => {
    setUserReports((prev) => {
      const next = [newReport, ...prev];
      AsyncStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const finishGuide = async () => {
    try {
      await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
    } catch {}
    setScreen(guideReturn);
  };

  if (screen === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      {screen === 'guide' ? <WelcomeScreen onContinue={finishGuide} /> : null}
      {screen === 'home' ? (
        <HomeMapSheetScreen
          onNavigate={setScreen}
          userReports={userReports}
          onAddReport={handleAddReport}
          onRouteEstimate={setActiveRouteEstimate}
        />
      ) : null}
      {screen === 'pro' ? (
        <ProScreen onNavigate={setScreen} routeEstimate={activeRouteEstimate} />
      ) : null}
      {screen === 'profile' ? (
        <ProfileScreen
          onNavigate={setScreen}
          onGuide={() => {
            setGuideReturn('profile');
            setScreen('guide');
          }}
          reportCount={userReports.length}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.canvas,
    ...Platform.select({ web: { width: '100%', maxWidth: 480, alignSelf: 'center' } }),
  },
  fullScreen: { flex: 1, backgroundColor: colors.canvas },
  homeMapViewport: {
    flex: 1,
    width: '100%',
    backgroundColor: '#E8EEE9',
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* Top Floating Pill & Location Controls */
  topOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 38,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 99,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  topPillText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  myLocationBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  myLocationText: { fontSize: 18, fontWeight: '700', color: colors.ink },
  collapseMapBtn: {
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 99,
    elevation: 3,
  },
  collapseMapText: { fontSize: 12, fontWeight: '800', color: colors.greenDark },
  trafficLegend: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#FFFFFFF2',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
    elevation: 4,
  },
  trafficLegendTitle: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
    textAlign: 'center',
  },
  trafficLegendItems: { flexDirection: 'row', gap: 12 },
  trafficLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trafficLegendDot: { width: 8, height: 8, borderRadius: 4 },
  trafficLegendLabel: { color: colors.ink, fontSize: 10, fontWeight: '700' },

  /* Animated Swipeable Sheet */
  animatedSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 2,
  },
  dragHandleHitbox: {
    paddingVertical: 8,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D6DDD9',
  },

  /* Compact Bottom Sheet Content */
  compactSheetBody: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 12,
  },
  greetingText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '500',
  },
  headlineText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.6,
    marginTop: -8,
  },
  destinationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D4F542',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  searchIcon: { fontSize: 20, color: '#172114', fontWeight: '700' },
  destinationPillText: { flex: 1, fontSize: 16, fontWeight: '700', color: '#172114' },
  timeBadge: {
    backgroundColor: '#E5FA87',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
  },
  timeBadgeText: { fontSize: 12, fontWeight: '700', color: '#172114' },

  quickCardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickPlaceCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F5F6F4',
    borderRadius: 16,
    padding: 12,
  },
  quickPlaceIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPlaceIcon: { fontSize: 12, fontWeight: '800', color: colors.ink },
  quickPlaceTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  quickPlaceSub: { fontSize: 12, color: colors.muted, marginTop: 1 },

  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  recentLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 0.7 },
  seeAllText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  recentIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F5F6F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentIcon: { fontSize: 17, color: colors.ink },
  recentTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  recentSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  chevron: { fontSize: 20, color: colors.muted },

  /* Expanded Bottom Sheet Content */
  expandedSheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 10,
  },
  expandedTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputField: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    paddingHorizontal: 13,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.canvas,
  },
  destInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  goBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: '#D4F542',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBtnText: { fontSize: 13, fontWeight: '800', color: '#172114' },
  chipsRow: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: '#F5F6F4',
  },
  chipActive: { backgroundColor: colors.green },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  chipTextActive: { color: colors.white },

  routeSummaryBox: {
    backgroundColor: colors.mint,
    borderRadius: 14,
    padding: 12,
  },
  eyebrow: { fontSize: 10, fontWeight: '800', color: colors.greenDark, letterSpacing: 0.8 },
  routeTimeHeadline: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 2 },
  smallMuted: { fontSize: 11, color: colors.muted },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, marginTop: 4 },
  compareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  providerTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  guideStepTitle: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 4 },
  fareText: { fontSize: 13, fontWeight: '700', color: colors.greenDark },
  openAppBtn: {
    backgroundColor: colors.green,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 11,
  },
  openAppBtnText: { color: colors.white, fontSize: 12, fontWeight: '800' },

  feedbackCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  sourceBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.greenDark,
    backgroundColor: colors.mint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  bodyText: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  disclaimerText: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 6 },

  /* Bottom Tab Bar */
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
  },
  navItem: { alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 96, paddingHorizontal: 4 },
  navPill: {
    minWidth: 48,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 99,
  },
  navPillActive: {
    backgroundColor: '#D4F542',
  },
  navIcon: { fontSize: 22, color: colors.muted, fontWeight: '700' },
  navIconActive: { color: '#172114', fontSize: 24 },
  navLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  navLabelActive: { color: colors.greenDark, fontSize: 13, fontWeight: '900' },

  /* Onboarding & Subpages */
  welcomePage: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 },
  logo: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  logoText: { color: colors.white, fontSize: 46, fontWeight: '800', marginTop: -4 },
  welcomeTitle: { textAlign: 'center', fontSize: 30, fontWeight: '800', color: colors.ink },
  welcomeSubtitle: { textAlign: 'center', fontSize: 15, fontWeight: '700', color: colors.green, marginTop: -8 },
  intro: { textAlign: 'center', fontSize: 14, color: colors.muted, lineHeight: 20 },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 6 },
  subPageContent: { padding: 20, paddingTop: 56, gap: 12 },
  proHeading: { gap: 5 },
  proIntro: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  proBanner: { backgroundColor: colors.greenDark, borderRadius: 18, padding: 18, gap: 3 },
  proBannerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  proBannerTag: { color: '#BCE8D3', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  proCountPill: { backgroundColor: '#FFFFFF22', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  proCountText: { color: colors.white, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  proPrice: { color: colors.white, fontSize: 34, fontWeight: '800', marginTop: 4 },
  proUnit: { fontSize: 14, color: '#D6EEE2' },
  proSub: { color: '#D6EEE2', fontSize: 13, marginTop: 2 },
  proSectionHeading: { fontSize: 15, fontWeight: '800', color: colors.ink, marginTop: 2 },
  proFeatureDropdown: { backgroundColor: colors.white, borderRadius: 15, padding: 11, borderWidth: 1, borderColor: colors.line, gap: 8 },
  proFeatureDropdownHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 },
  proFeatureDropdownToggle: { color: colors.greenDark, fontSize: 22, fontWeight: '800', paddingHorizontal: 6 },
  proFeatureCard: { backgroundColor: colors.white, borderRadius: 17, padding: 14, borderWidth: 1, borderColor: colors.line, gap: 11 },
  proActiveFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.white, borderRadius: 14, padding: 11, borderWidth: 1, borderColor: colors.line },
  proActiveFeatureCheck: { color: colors.greenDark, fontSize: 16, fontWeight: '800', marginLeft: 'auto' },
  proCancelButton: { minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#D9534F', backgroundColor: colors.white },
  proCancelButtonText: { color: '#B42318', fontSize: 13, fontWeight: '800' },
  proFeatureHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  proFeatureIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  proFeatureIconText: { fontSize: 19, fontWeight: '800', color: colors.greenDark },
  proFeatureCopy: { flex: 1, gap: 4 },
  proFeatureTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  proFeatureTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.ink },
  proFeatureNumber: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  proPreviewBox: { backgroundColor: '#F5F8F6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 5 },
  proPreviewLabel: { color: colors.greenDark, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, marginBottom: 1 },
  proPreviewRow: { color: colors.ink, fontSize: 11, fontWeight: '600', lineHeight: 16 },
  proFooterNote: { backgroundColor: colors.mint, borderRadius: 14, padding: 13, gap: 4 },
  proFooterTitle: { color: colors.greenDark, fontSize: 12, fontWeight: '800' },
  proMetricsRow: { flexDirection: 'row', gap: 8 },
  proMetric: { flex: 1, backgroundColor: '#F5F8F6', borderRadius: 12, padding: 10, gap: 3 },
  proMetricLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  proMetricValue: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  proMetricTrend: { color: colors.muted, fontSize: 9, lineHeight: 13 },
  proRouteTrend: { backgroundColor: '#F5F8F6', borderRadius: 12, padding: 10, gap: 5 },
  proSmallAction: { alignSelf: 'flex-start', backgroundColor: colors.green, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10 },
  proSmallActionText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  proLogRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 9, gap: 8 },
  proLogRoute: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  proLogAmount: { color: colors.greenDark, fontSize: 13, fontWeight: '800' },
  proPlannerInputs: { flexDirection: 'row', gap: 6 },
  proPlannerField: { flex: 1, gap: 5 },
  proPlannerResult: { backgroundColor: colors.mint, color: colors.greenDark, borderRadius: 12, padding: 12, fontSize: 13, fontWeight: '800', lineHeight: 19 },
  proVoucherPreview: { backgroundColor: '#F5F8F6', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.green, borderRadius: 12, padding: 12, gap: 3 },
  proVoucherAmount: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  proBuyButton: { minHeight: 48, backgroundColor: colors.green, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  proBuyButtonText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontSize: 24, fontWeight: '800', color: colors.green },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  subscriptionStatusPill: { borderRadius: 99, backgroundColor: '#EEF1EF', paddingHorizontal: 10, paddingVertical: 6 },
  subscriptionStatusPillActive: { backgroundColor: colors.mint },
  subscriptionStatusText: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  subscriptionStatusTextActive: { color: colors.greenDark },

  /* Modals & Buttons */
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#0D201888' },
  modalCard: { backgroundColor: colors.white, borderRadius: 20, padding: 18, gap: 10 },
  primaryBtn: { minHeight: 46, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  secondaryBtn: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { color: colors.green, fontSize: 13, fontWeight: '700' },
});
