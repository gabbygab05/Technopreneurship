import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, TextInput,
  StatusBar, StyleSheet, Text, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { colors, platformColor } from './utils/colors';
import { getNearbyRiders, getRidersByPlatform } from './services/riderService';
import RiderMap from './components/RiderMap';

const HOME = { latitude: 8.4820, longitude: 124.6470 };
const FIRST_LAUNCH_KEY = 'elingkod.guideSeen';
const platforms = ['All', 'Angkas', 'Move It', 'JoyRide'];
const platformLinks = {
  Angkas: 'https://www.angkas.com/',
  'Move It': 'https://moveit.com.ph/',
  JoyRide: 'https://joyride.com.ph/',
};
const platformApps = {
  Angkas: { androidPackage: 'com.angkas.passenger', iosScheme: 'angkas://', iosStore: 'https://apps.apple.com/ph/app/angkas-motorcycle-taxi-ph/id6464280697' },
  'Move It': { androidPackage: 'com.moveit.app.customer', iosScheme: 'moveit://', iosStore: 'https://apps.apple.com/ph/app/move-it-book-a-moto-taxi/id1481198245' },
  JoyRide: { androidPackage: 'com.joyride.rider', iosScheme: 'joyride://', iosStore: 'https://apps.apple.com/ph/app/joyride-book-moto-taxi-car/id1482083123' },
};

function distanceKm(from, to) {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(to.latitude - from.latitude);
  const dLon = rad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.latitude)) * Math.cos(rad(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function Button({ title, onPress, secondary = false, compact = false }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [
      styles.button, secondary && styles.buttonSecondary, compact && styles.buttonCompact, pressed && styles.pressed,
    ]}>
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{title}</Text>
    </Pressable>
  );
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Header({ right, title = 'eLingkod', subtitle }) {
  return (
    <View style={styles.header}>
      <View><Text style={styles.brand}>{title}</Text>{subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}</View>
      {right || null}
    </View>
  );
}

function Disclaimer() {
  return <Text style={styles.disclaimer}>Prototype demo: rider locations, fares, ETAs, and availability are simulated. This is not connected to ride-hailing platforms.</Text>;
}

function WelcomeScreen({ onContinue }) {
  return (
    <ScrollView contentContainerStyle={styles.welcomePage}>
      <View style={styles.logo}><Text style={styles.logoText}>e</Text></View>
      <Text style={styles.welcomeTitle}>eLingkod</Text>
      <Text style={styles.welcomeSubtitle}>Your Multi-Rider Assistant</Text>
      <Text style={styles.intro}>Compare simulated nearby riders from different platforms in one simple map.</Text>
      <Card style={styles.guideCard}>
        <Text style={styles.sectionTitle}>Map guide</Text>
        {[['Angkas', colors.angkas], ['Move It', colors.moveIt], ['JoyRide', colors.joyRide], ['Your location', colors.green]].map(([name, color]) => (
          <View key={name} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.bodyText}>{name}</Text></View>
        ))}
      </Card>
      <Card style={styles.guideCard}>
        <Text style={styles.sectionTitle}>How to use</Text>
        <Text style={styles.bodyText}>1. View nearby demonstration riders{ '\n' }2. Select a rider for details{ '\n' }3. Compare estimated fares and distances{ '\n' }4. Continue to a platform website</Text>
      </Card>
      <Disclaimer />
      <Button title="GOT IT!" onPress={onContinue} />
    </ScrollView>
  );
}

function HomeScreen({ onSelectRider, onNavigate, riders, location, locationGranted, onRefreshLocation }) {
  const [filter, setFilter] = useState('All');
  const [fromWhere, setFromWhere] = useState('');
  const [whereTo, setWhereTo] = useState('');
  const visibleRiders = useMemo(() => riders.filter((rider) => filter === 'All' || rider.platform === filter), [riders, filter]);
  const counts = useMemo(() => ({
    Angkas: riders.filter((r) => r.platform === 'Angkas').length,
    'Move It': riders.filter((r) => r.platform === 'Move It').length,
    JoyRide: riders.filter((r) => r.platform === 'JoyRide').length,
  }), [riders]);
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <Header right={<View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => onNavigate('profile')} style={styles.iconButton}><Text style={styles.icon}>○</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => Alert.alert('Demo notifications', 'Fare alerts are examples only. No live rider or fare updates are connected.')} style={styles.iconButton}><Text style={styles.icon}>🔔</Text></Pressable>
      </View>} />
      <Card style={styles.locationCard}>
        <View style={{ flex: 1 }}><Text style={styles.eyebrow}>YOUR LOCATION</Text><Text style={styles.locationName}>{locationGranted ? 'Current location' : 'Cagayan de Oro City'}</Text><Text style={styles.smallMuted}>{locationGranted ? 'Using your device location' : 'Demonstration location'}</Text></View>
        <Pressable accessibilityRole="button" onPress={onRefreshLocation} style={styles.refreshButton}><Text style={styles.refreshText}>↻  Refresh</Text></Pressable>
      </Card>
      <View style={styles.mapWrap}>
        <RiderMap riders={visibleRiders} location={location} locationGranted={locationGranted} onSelectRider={onSelectRider} />
        <View pointerEvents="none" style={styles.mapBadge}><View style={styles.liveDot} /><Text style={styles.mapBadgeText}>DEMO MAP</Text></View>
      </View>
      <Text style={styles.mapHint}>Tap a colored marker to view a rider</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {platforms.map((item) => (
          <Pressable key={item} accessibilityRole="button" onPress={() => setFilter(item)} style={[styles.filterChip, filter === item && styles.filterChipActive]}>
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.sectionTitle}>Nearby simulated riders</Text>
      <View style={styles.summaryRow}>
        {Object.entries(counts).map(([name, count]) => <Card key={name} style={styles.summaryCard}><View style={[styles.summaryDot, { backgroundColor: platformColor(name) }]} /><Text style={styles.summaryCount}>{count}</Text><Text style={styles.summaryLabel}>{name}</Text></Card>)}
      </View>
      <Card style={styles.tripCard}>
        <Text style={styles.sectionTitle}>Plan your trip</Text>
        <TextInput
          accessibilityLabel="From where?"
          placeholder="From where?"
          placeholderTextColor={colors.muted}
          value={fromWhere}
          onChangeText={setFromWhere}
          style={styles.tripInput}
          returnKeyType="next"
        />
        <TextInput
          accessibilityLabel="Where to?"
          placeholder="Where to?"
          placeholderTextColor={colors.muted}
          value={whereTo}
          onChangeText={setWhereTo}
          style={styles.tripInput}
          returnKeyType="done"
        />
      </Card>
      {fromWhere.trim() && whereTo.trim() ? <Card style={styles.compareCard}>
        <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Fare snapshot</Text><Text style={styles.smallMuted}>simulated</Text></View>
        <Text style={styles.tripSummary}>{fromWhere.trim()} → {whereTo.trim()}</Text>
        {['Angkas', 'Move It', 'JoyRide'].map((name) => {
          const group = riders.filter((r) => r.platform === name);
          const low = Math.min(...group.map((r) => r.estimatedFare));
          return <View key={name} style={styles.fareRow}><Text style={styles.bodyText}>{name}</Text><Text style={styles.fareValue}>from ₱{low}</Text></View>;
        })}
      </Card> : null}
      <Disclaimer />
      <BottomNavigation active="Home" onNavigate={onNavigate} />
    </ScrollView>
  );
}

function RiderDetailsScreen({ rider, location, onBack }) {
  if (!rider) return null;
  const distance = distanceKm(location, rider).toFixed(1);
  const low = Math.max(40, rider.estimatedFare - 10);
  const high = rider.estimatedFare + 5;
  const openPlatformApp = async () => {
    const app = platformApps[rider.platform];
    try {
      if (Platform.OS === 'android') {
        await Linking.openURL(`intent://#Intent;package=${app.androidPackage};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`);
      } else if (Platform.OS === 'ios') {
        await Linking.openURL(app.iosScheme);
      } else {
        await Linking.openURL(platformLinks[rider.platform]);
      }
    } catch {
      const fallback = Platform.OS === 'ios' ? app.iosStore : `https://play.google.com/store/apps/details?id=${app.androidPackage}`;
      Linking.openURL(fallback).catch(() => Alert.alert('Unable to open app', 'Please install the app or check your internet connection.'));
    }
  };
  const openPlatform = async () => {
    Alert.alert('Continue to platform', 'Choose the selected platform. eLingkod will open its app or app listing; bookings are not integrated.', [
      { text: 'Cancel', style: 'cancel' },
      { text: `Open ${rider.platform}`, onPress: openPlatformApp },
    ]);
  };
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <Header title="Rider details" right={<Pressable onPress={onBack} style={styles.iconButton}><Text style={styles.icon}>×</Text></Pressable>} />
      <Card style={styles.riderHero}>
        <View style={[styles.platformIcon, { backgroundColor: platformColor(rider.platform) }]}><Text style={styles.platformIconText}>✦</Text></View>
        <Text style={styles.riderName}>{rider.platform}</Text><Text style={styles.bodyText}>{rider.name}</Text>
        <View style={styles.simulatedPill}><Text style={styles.simulatedText}>SIMULATED RIDER</Text></View>
      </Card>
      <Card>
        <InfoRow label="Approx. distance" value={`${distance} km`} />
        <InfoRow label="Estimated arrival" value={`${rider.eta} min`} />
        <InfoRow label="Estimated fare" value={`₱${low}–₱${high}`} last />
      </Card>
      <Text style={styles.note}>This rider is demonstration data and is not confirmed to be nearby or available. eLingkod does not process bookings.</Text>
      <Button title="OPEN PLATFORM WEBSITE" onPress={openPlatform} />
      <Button title="VIEW OTHER RIDERS" secondary onPress={onBack} />
      <Disclaimer />
      <Text style={styles.backLink} onPress={onBack}>← Back to map</Text>
    </ScrollView>
  );
}

function InfoRow({ label, value, last }) {
  return <View style={[styles.infoRow, !last && styles.infoBorder]}><Text style={styles.bodyText}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function ProScreen({ onUpgrade, onNavigate, riders }) {
  const platformFareRanges = ['Angkas', 'Move It', 'JoyRide'].map((platform) => {
    const fares = riders.filter((rider) => rider.platform === platform).map((rider) => rider.estimatedFare);
    return { platform, low: Math.min(...fares), high: Math.max(...fares) };
  });
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <Header title="Commuter PRO" subtitle="More helpful commute insights" />
      <Card style={styles.proHero}><Text style={styles.proTag}>OPTIONAL PREMIUM PLAN</Text><Text style={styles.price}>₱29<Text style={styles.priceUnit}> / month</Text></Text><Text style={styles.proSub}>Your basic rider map stays free.</Text></Card>
      <Text style={styles.sectionTitle}>Premium features</Text>
      <Card style={styles.featureCard}><Text style={styles.featureIcon}>↘</Text><View style={styles.featureText}><Text style={styles.featureTitle}>Price comparison alerts</Text><Text style={styles.bodyText}>Demo alert: Move It estimate changed from ₱85 to ₱70.</Text></View></Card>
      <Card style={styles.featureCard}><Text style={styles.featureIcon}>◷</Text><View style={styles.featureText}><Text style={styles.featureTitle}>Suggested commute times</Text><Text style={styles.bodyText}>Sample suggestion: 7:00–7:30 AM. This is not a traffic forecast.</Text></View></Card>
      <Card style={styles.featureCard}><Text style={styles.featureIcon}>▤</Text><View style={styles.featureText}><Text style={styles.featureTitle}>Personal commute insights</Text><Text style={styles.bodyText}>See simple sample fare comparisons and commuting tips.</Text></View></Card>
      <Card style={styles.compareCard}>
        <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Sample fare comparison</Text><Text style={styles.smallMuted}>simulated</Text></View>
        {platformFareRanges.map(({ platform, low, high }) => <View key={platform} style={styles.fareRow}><Text style={styles.bodyText}>{platform}</Text><Text style={styles.fareValue}>₱{low}–₱{high}</Text></View>)}
        <Text style={[styles.bodyText, { marginTop: 8 }]}>Example insight: the lowest sample estimate is ₱{Math.min(...platformFareRanges.map(({ low }) => low))}. Compare distance and ETA too; these values do not predict a real trip.</Text>
      </Card>
      <Button title="UPGRADE TO PRO" onPress={onUpgrade} />
      <Card style={styles.modelCard}><Text style={styles.sectionTitle}>Academic business model</Text><Text style={styles.bodyText}>Freemium: core features are free. Optional Commuter PRO: ₱29/month. Referral commission assumption: ₱2–₱5 (₱3.50 baseline) per completed referral. No subscription, commission, or referral is processed by this prototype.</Text></Card>
      <Disclaimer />
      <BottomNavigation active="Commuter PRO" onNavigate={onNavigate} />
    </ScrollView>
  );
}

function ProfileScreen({ onNavigate, onGuide }) {
  const [notifications, setNotifications] = useState(true);
  const [modal, setModal] = useState(false);
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <Header title="Profile" />
      <Card style={styles.profileCard}><View style={styles.avatar}><Text style={styles.avatarText}>M</Text></View><Text style={styles.profileName}>Mika Santos</Text><Text style={styles.bodyText}>mika.santos@example.com</Text><View style={styles.freePill}><Text style={styles.freeText}>FREE PLAN</Text></View></Card>
      <Card style={styles.settingsCard}>
        <SettingRow label="View user guide" value="›" onPress={onGuide} />
        <SettingRow label="Notifications" value={notifications ? 'On' : 'Off'} onPress={() => setNotifications((value) => !value)} />
        <SettingRow label="About eLingkod" value="›" onPress={() => setModal(true)} />
        <SettingRow label="Privacy information" value="›" onPress={() => Alert.alert('Privacy', 'This demo uses your location only when you grant permission to center the map. Sample profile and rider details are stored locally in this prototype.')} last />
      </Card>
      <Button title="DEMONSTRATION LOG OUT" secondary onPress={() => Alert.alert('Demo action', 'Authentication is not implemented in this prototype.')} />
      <Disclaimer />
      <BottomNavigation active="Profile" onNavigate={onNavigate} />
      <Modal transparent visible={modal} animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.modalBackdrop}><Card style={styles.modalCard}><Text style={styles.sectionTitle}>About eLingkod</Text><Text style={styles.bodyText}>A student prototype that brings simulated motorcycle rider options into one view. It is not affiliated with or connected to Angkas, Move It, or JoyRide.</Text><Button title="CLOSE" onPress={() => setModal(false)} /></Card></View>
      </Modal>
    </ScrollView>
  );
}

function SettingRow({ label, value, onPress, last }) {
  return <Pressable onPress={onPress} style={[styles.settingRow, !last && styles.infoBorder]}><Text style={styles.bodyText}>{label}</Text><Text style={styles.settingValue}>{value}</Text></Pressable>;
}

function BottomNavigation({ active, onNavigate }) {
  return <View style={styles.bottomNav}>{[['Home', '⌂'], ['Commuter PRO', '✦'], ['Profile', '○']].map(([label, icon]) => <Pressable key={label} onPress={() => onNavigate(label === 'Home' ? 'home' : label === 'Profile' ? 'profile' : 'pro')} style={styles.navItem}><Text style={[styles.navIcon, active === label && styles.navActive]}>{icon}</Text><Text style={[styles.navLabel, active === label && styles.navActive]}>{label}</Text></Pressable>)}</View>;
}

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [guideReturn, setGuideReturn] = useState('home');
  const [allRiders, setAllRiders] = useState([]);
  const [rider, setRider] = useState(null);
  const [location, setLocation] = useState(HOME);
  const [locationGranted, setLocationGranted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [seen, data] = await Promise.all([AsyncStorage.getItem(FIRST_LAUNCH_KEY), getNearbyRiders()]);
        setAllRiders(data);
        setScreen(seen === 'true' ? 'home' : 'guide');
      } catch {
        setAllRiders(await getRidersByPlatform('All'));
        setScreen('guide');
      }
    })();
  }, []);

  const refreshLocation = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocation(HOME);
        setLocationGranted(false);
        Alert.alert('Using demo location', 'Location permission was not granted. The map is centered on Cagayan de Oro City.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setLocationGranted(true);
    } catch {
      setLocation(HOME);
      setLocationGranted(false);
      Alert.alert('Location unavailable', 'Using the Cagayan de Oro City demonstration location.');
    } finally { setBusy(false); }
  }, []);

  const finishGuide = async () => {
    try { await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true'); } catch { /* Continue for this app session if storage is unavailable. */ }
    setScreen(guideReturn);
  };
  const showGuide = (returnTo = screen) => { setGuideReturn(returnTo); setScreen('guide'); };
  const selectRider = (selected) => { setRider(selected); setScreen('details'); };

  if (screen === 'loading') return <View style={styles.loading}><ActivityIndicator size="large" color={colors.green} /><Text style={styles.smallMuted}>Preparing your demo…</Text></View>;
  return (
    <View style={styles.app}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
      {screen === 'guide' ? <WelcomeScreen onContinue={finishGuide} /> : null}
      {screen === 'home' ? <HomeScreen riders={allRiders} location={location} locationGranted={locationGranted} onRefreshLocation={refreshLocation} onSelectRider={selectRider} onNavigate={setScreen} /> : null}
      {screen === 'details' ? <RiderDetailsScreen rider={rider} location={location} onBack={() => setScreen('home')} /> : null}
      {screen === 'pro' ? <ProScreen riders={allRiders} onUpgrade={() => Alert.alert('Commuter PRO demo', 'Subscription payments are not available in this MVP. No payment has been made.')} onNavigate={setScreen} /> : null}
      {screen === 'profile' ? <ProfileScreen onNavigate={setScreen} onGuide={() => showGuide('profile')} /> : null}
      {busy ? <View pointerEvents="none" style={styles.busyBadge}><ActivityIndicator size="small" color={colors.white} /><Text style={styles.busyText}>Updating location</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.canvas, ...Platform.select({ web: { width: '100%', maxWidth: 560, alignSelf: 'center' } }) },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.canvas },
  page: { flex: 1 }, pageContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, gap: 14 },
  welcomePage: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 30, gap: 14 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerActions: { flexDirection: 'row', gap: 8 },
  brand: { color: colors.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.7 },
  headerSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  iconButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.ink, fontSize: 24, fontWeight: '500' },
  logo: { width: 72, height: 72, borderRadius: 23, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  logoText: { color: colors.white, fontSize: 52, fontWeight: '800', marginTop: -6 },
  welcomeTitle: { textAlign: 'center', color: colors.ink, fontWeight: '800', fontSize: 34, letterSpacing: -1 },
  welcomeSubtitle: { textAlign: 'center', color: colors.green, fontSize: 16, fontWeight: '700', marginTop: -12 },
  intro: { textAlign: 'center', color: colors.muted, fontSize: 15, lineHeight: 22, marginHorizontal: 10, marginBottom: 4 },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.line, shadowColor: '#17372A', shadowOpacity: 0.035, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  guideCard: { paddingVertical: 13 }, sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  bodyText: { fontSize: 14, color: colors.muted, lineHeight: 21 }, legendRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 7 },
  legendDot: { width: 10, height: 10, borderRadius: 5 }, button: { minHeight: 52, paddingHorizontal: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, marginTop: 2 },
  buttonSecondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, buttonCompact: { minHeight: 40 }, buttonText: { color: colors.white, fontSize: 13, fontWeight: '800', letterSpacing: 0.45 },
  buttonSecondaryText: { color: colors.green }, pressed: { opacity: 0.75 }, disclaimer: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 4 },
  locationCard: { flexDirection: 'row', alignItems: 'center', padding: 14 }, tripCard: { gap: 10, paddingVertical: 14 }, tripInput: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.canvas, fontSize: 14 }, tripSummary: { color: colors.muted, fontSize: 12, marginTop: -6, marginBottom: 8 }, eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 }, locationName: { color: colors.ink, fontWeight: '700', fontSize: 15, marginTop: 3 }, smallMuted: { color: colors.muted, fontSize: 12, marginTop: 2 },
  refreshButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.mint }, refreshText: { color: colors.greenDark, fontWeight: '700', fontSize: 12 },
  mapWrap: { height: 340, overflow: 'hidden', borderRadius: 22, backgroundColor: '#DDEBE4' }, mapBadge: { position: 'absolute', left: 12, top: 12, borderRadius: 12, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green }, mapBadgeText: { color: colors.greenDark, fontWeight: '800', fontSize: 9, letterSpacing: 0.8 }, mapHint: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: -8 },
  filters: { gap: 8, paddingVertical: 2 }, filterChip: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 99, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, filterChipActive: { backgroundColor: colors.green, borderColor: colors.green }, filterText: { fontWeight: '600', fontSize: 12, color: colors.muted }, filterTextActive: { color: colors.white },
  summaryRow: { flexDirection: 'row', gap: 8 }, summaryCard: { flex: 1, alignItems: 'center', paddingHorizontal: 5, paddingVertical: 12, borderRadius: 16 }, summaryDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 }, summaryCount: { color: colors.ink, fontSize: 20, fontWeight: '800' }, summaryLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },
  compareCard: { paddingVertical: 14 }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, fareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }, fareValue: { color: colors.greenDark, fontSize: 13, fontWeight: '700' },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingVertical: 10 }, navItem: { alignItems: 'center', minWidth: 72, gap: 2 }, navIcon: { color: colors.muted, fontSize: 19 }, navLabel: { color: colors.muted, fontSize: 10, fontWeight: '600' }, navActive: { color: colors.green, fontWeight: '800' },
  riderHero: { alignItems: 'center', paddingVertical: 26 }, platformIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, platformIconText: { color: colors.white, fontSize: 28 }, riderName: { fontSize: 23, color: colors.ink, fontWeight: '800', marginTop: 12 }, simulatedPill: { backgroundColor: colors.mint, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, marginTop: 12 }, simulatedText: { color: colors.greenDark, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 }, infoBorder: { borderBottomWidth: 1, borderBottomColor: colors.line }, infoValue: { color: colors.ink, fontSize: 14, fontWeight: '700' }, note: { color: colors.muted, fontSize: 12, lineHeight: 19, paddingHorizontal: 4 }, backLink: { color: colors.green, textAlign: 'center', fontSize: 13, fontWeight: '700', paddingVertical: 8 },
  proHero: { backgroundColor: colors.greenDark, padding: 22 }, proTag: { color: '#BCE8D3', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, price: { color: colors.white, fontSize: 38, fontWeight: '800', marginTop: 7 }, priceUnit: { fontSize: 14, fontWeight: '500', color: '#D6EEE2' }, proSub: { color: '#D6EEE2', fontSize: 13, marginTop: 2 }, featureCard: { flexDirection: 'row', gap: 13, alignItems: 'flex-start' }, featureIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.mint, textAlign: 'center', textAlignVertical: 'center', color: colors.green, overflow: 'hidden', fontSize: 21 }, featureText: { flex: 1, gap: 3 }, featureTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' }, modelCard: { backgroundColor: '#F0F5F1' },
  profileCard: { alignItems: 'center', paddingVertical: 22 }, avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.green, fontSize: 26, fontWeight: '800' }, profileName: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 10 }, freePill: { marginTop: 10, backgroundColor: colors.mint, borderRadius: 30, paddingHorizontal: 11, paddingVertical: 5 }, freeText: { color: colors.greenDark, fontWeight: '800', fontSize: 9, letterSpacing: 0.8 }, settingsCard: { paddingVertical: 2 }, settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 }, settingValue: { color: colors.green, fontWeight: '700', fontSize: 13 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0D201888' }, modalCard: { gap: 10 }, busyBadge: { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: colors.greenDark, borderRadius: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }, busyText: { color: colors.white, fontSize: 12, fontWeight: '600' },
});
