import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, Linking, Modal, PanResponder,
  Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { colors, platformColor } from './utils/colors';

const FIRST_LAUNCH_KEY = 'elingkod.guideSeen';
const REPORTS_STORAGE_KEY = 'elingkod.userReports.v1';
const PLATFORMS = ['Angkas', 'Move It', 'JoyRide'];
const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const USTP_COORDS = { latitude: 8.4859, longitude: 124.6565 };

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const EXPANDED_OFFSET = 0;
const COLLAPSED_OFFSET = Math.round(SCREEN_HEIGHT * 0.44);

const DESTINATIONS = [
  {
    id: 'sm-downtown',
    title: 'SM Downtown',
    subtitle: 'CM Recto Ave · Cagayan de Oro',
    coords: { latitude: 8.4847, longitude: 124.6502 },
    fallbackKm: 1.4,
    fallbackMin: 6,
  },
  {
    id: 'limketkai',
    title: 'Limketkai Center',
    subtitle: 'Lapasan · Cagayan de Oro',
    coords: { latitude: 8.4809, longitude: 124.6567 },
    fallbackKm: 1.2,
    fallbackMin: 5,
  },
  {
    id: 'gmall',
    title: 'Gaisano Mall (Gmall)',
    subtitle: 'Corrales Ext · Cagayan de Oro',
    coords: { latitude: 8.4892, longitude: 124.6489 },
    fallbackKm: 2.1,
    fallbackMin: 9,
  },
  {
    id: 'cogon',
    title: 'Cogon Market',
    subtitle: 'Osmeña St · Cagayan de Oro',
    coords: { latitude: 8.4774, longitude: 124.6494 },
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

function computeFallbackRoute(originText, destText, originCoords) {
  const matched = DESTINATIONS.find((d) =>
    destText.toLowerCase().includes(d.title.toLowerCase())
  );
  if (matched) {
    return {
      distanceKm: matched.fallbackKm,
      durationMin: matched.fallbackMin,
      destinationCoords: matched.coords,
      source: 'Google Maps route reference (fallback)',
    };
  }
  const len = Math.max(8, originText.trim().length + destText.trim().length);
  const distanceKm = Number((1.4 + (len % 35) * 0.15).toFixed(1));
  const durationMin = Math.max(5, Math.round(distanceKm * 4.2));
  const baseLat = originCoords?.latitude ?? USTP_COORDS.latitude;
  const baseLng = originCoords?.longitude ?? USTP_COORDS.longitude;
  return {
    distanceKm,
    durationMin,
    destinationCoords: { latitude: baseLat - 0.0044, longitude: baseLng - 0.008 },
    source: 'Route planning estimate (add Google Maps API key for live traffic)',
  };
}

async function fetchGoogleMapsRoute(originText, destText, originCoords) {
  const fallback = computeFallbackRoute(originText, destText, originCoords);
  const apiOrigin = originCoords
    ? `${originCoords.latitude},${originCoords.longitude}`
    : originText;

  if (!GOOGLE_MAPS_KEY) return fallback;

  try {
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${encodeURIComponent(apiOrigin)}` +
      `&destinations=${encodeURIComponent(destText)}` +
      `&mode=driving&key=${encodeURIComponent(GOOGLE_MAPS_KEY)}`;
    const res = await fetch(url);
    const json = await res.json();
    const element = json?.rows?.[0]?.elements?.[0];
    if (json.status === 'OK' && element?.status === 'OK') {
      return {
        distanceKm: Number((element.distance.value / 1000).toFixed(1)),
        durationMin: Math.max(1, Math.round(element.duration.value / 60)),
        destinationCoords: fallback.destinationCoords,
        source: 'Google Maps Distance Matrix',
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
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
      <Text style={styles.welcomeSubtitle}>Ride Comparison & Trip Planner</Text>
      <Text style={styles.intro}>
        View your location on the map, compare estimated fares across Angkas, Move It, and JoyRide, read commuter feedback, check Google Maps travel time, and open your chosen app.
      </Text>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>How it works</Text>
        <Text style={styles.bodyText}>
          1. Swipe up or tap "Enter destination" on the bottom sheet{'\n'}
          2. View Google Maps travel time & fare estimates{'\n'}
          3. Read user-reported fares and ride feedback{'\n'}
          4. Open your preferred platform to book
        </Text>
      </View>
      <Pressable onPress={onContinue} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>GET STARTED</Text>
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
}) {
  const mapRef = useRef(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [userCoords, setUserCoords] = useState(USTP_COORDS);
  const [hasLiveFix, setHasLiveFix] = useState(false);
  const [locStatus, setLocStatus] = useState('Locating you…');
  const [origin, setOrigin] = useState('USTP CDO, Claro M. Recto Ave');
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
        setOrigin(`${nextCoords.latitude.toFixed(4)}, ${nextCoords.longitude.toFixed(4)}`);
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
      const originCoordsForApi = hasLiveFix ? userCoords : null;
      const result = await fetchGoogleMapsRoute(fromText, toText, originCoordsForApi);
      setRouteEstimate(result);
    } finally {
      setLoadingRoute(false);
    }
  }, [hasLiveFix, userCoords]);

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
        style={StyleSheet.absoluteFillObject}
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
          coordinate={userCoords}
          title={hasLiveFix ? 'You are here' : 'USTP CDO reference'}
          description={locStatus}
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
            <Polyline
              coordinates={[userCoords, routeEstimate.destinationCoords]}
              strokeColor={colors.green}
              strokeWidth={4}
            />
          </>
        ) : null}
      </MapView>

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
                  <Text style={styles.eyebrow}>GOOGLE MAPS TRAVEL ESTIMATE</Text>
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

function ProScreen({ onNavigate, userReports }) {
  return (
    <View style={styles.fullScreen}>
      <ScrollView contentContainerStyle={styles.subPageContent}>
        <Text style={styles.expandedTitle}>Commuter PRO</Text>
        <Text style={styles.smallMuted}>Optional commute insights · ₱29 / month</Text>
        <View style={styles.proBanner}>
          <Text style={styles.proBannerTag}>OPTIONAL UPGRADE</Text>
          <Text style={styles.proPrice}>₱29<Text style={styles.proUnit}> / month</Text></Text>
          <Text style={styles.proSub}>Core price comparison, route estimates & app links stay free.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.providerTitle}>New Price Report Alerts</Text>
          <Text style={styles.bodyText}>Get notified when commuters post new fare updates ({userReports.length} saved reports).</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.providerTitle}>Saved Campus Routes</Text>
          <Text style={styles.bodyText}>Pin frequent routes for one-tap Google Maps travel-time checks.</Text>
        </View>
        <Pressable
          onPress={() => Alert.alert('Commuter PRO', 'Billing is not active in this student prototype.')}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>PREVIEW PRO PLAN</Text>
        </Pressable>
      </ScrollView>
      <BottomNavigation active="Commuter PRO" onNavigate={onNavigate} />
    </View>
  );
}

function ProfileScreen({ onNavigate, onGuide, reportCount }) {
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
          <Pressable onPress={onGuide} style={styles.settingRow}>
            <Text style={styles.bodyText}>View onboarding guide</Text>
            <Text style={styles.seeAllText}>›</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert(
                'About eLingkod',
                'eLingkod compares motorcycle ride-hailing estimates, user-reported feedback, and Google Maps travel time, then redirects you to Angkas, Move It, or JoyRide.'
              )
            }
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
    { key: 'pro', label: 'Activity', icon: '▤' },
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
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
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
        />
      ) : null}
      {screen === 'pro' ? (
        <ProScreen onNavigate={setScreen} userReports={userReports} />
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
  navItem: { alignItems: 'center', gap: 3, minWidth: 74 },
  navPill: {
    paddingHorizontal: 18,
    paddingVertical: 4,
    borderRadius: 99,
  },
  navPillActive: {
    backgroundColor: '#D4F542',
  },
  navIcon: { fontSize: 17, color: colors.muted, fontWeight: '700' },
  navIconActive: { color: '#172114' },
  navLabel: { fontSize: 11, fontWeight: '600', color: colors.muted },
  navLabelActive: { color: colors.ink, fontWeight: '800' },

  /* Onboarding & Subpages */
  welcomePage: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 },
  logo: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  logoText: { color: colors.white, fontSize: 46, fontWeight: '800', marginTop: -4 },
  welcomeTitle: { textAlign: 'center', fontSize: 30, fontWeight: '800', color: colors.ink },
  welcomeSubtitle: { textAlign: 'center', fontSize: 15, fontWeight: '700', color: colors.green, marginTop: -8 },
  intro: { textAlign: 'center', fontSize: 14, color: colors.muted, lineHeight: 20 },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 6 },
  subPageContent: { padding: 20, paddingTop: 56, gap: 12 },
  proBanner: { backgroundColor: colors.greenDark, borderRadius: 18, padding: 20 },
  proBannerTag: { color: '#BCE8D3', fontSize: 10, fontWeight: '800' },
  proPrice: { color: colors.white, fontSize: 34, fontWeight: '800', marginTop: 4 },
  proUnit: { fontSize: 14, color: '#D6EEE2' },
  proSub: { color: '#D6EEE2', fontSize: 13, marginTop: 2 },
  avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontSize: 24, fontWeight: '800', color: colors.green },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },

  /* Modals & Buttons */
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#0D201888' },
  modalCard: { backgroundColor: colors.white, borderRadius: 20, padding: 18, gap: 10 },
  primaryBtn: { minHeight: 46, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  secondaryBtn: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { color: colors.green, fontSize: 13, fontWeight: '700' },
});