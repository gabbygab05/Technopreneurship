import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, platformColor } from '../utils/colors';

const platformLogos = {
  Angkas: require('../assets/logos/angkas.png'),
  'Move It': require('../assets/logos/move-it.png'),
  JoyRide: require('../assets/logos/joyride.png'),
};

export default function RiderMap({ riders, locationGranted, onSelectRider }) {
  return (
    <View style={styles.map}>
      {[18, 38, 63, 82].map((top) => <View key={`h-${top}`} style={[styles.roadHorizontal, { top: `${top}%` }]} />)}
      {[16, 42, 69, 88].map((left) => <View key={`v-${left}`} style={[styles.roadVertical, { left: `${left}%` }]} />)}
      <View style={[styles.userPin, locationGranted && styles.currentUserPin]}><Text style={styles.userDot}>●</Text></View>
      {riders.map((rider, index) => (
        <Pressable
          key={rider.id}
          accessibilityRole="button"
          accessibilityLabel={`View ${rider.platform} rider ${rider.id}`}
          onPress={() => onSelectRider(rider)}
          style={[styles.riderPin, { backgroundColor: platformColor(rider.platform), left: `${12 + ((index * 37) % 75)}%`, top: `${12 + ((index * 29) % 76)}%` }]}
        >
          <Text style={styles.pinFallback}>{rider.platform === 'Move It' ? 'M' : rider.platform[0]}</Text>
          <Image source={platformLogos[rider.platform]} style={styles.riderLogo} resizeMode="contain" />
        </Pressable>
      ))}
      <View style={styles.mapLabel}><Text style={styles.labelText}>Cagayan de Oro · schematic</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#E4EFE8' },
  roadHorizontal: { position: 'absolute', height: 8, left: '-5%', right: '-5%', backgroundColor: '#FFFFFF', transform: [{ rotate: '-8deg' }] },
  roadVertical: { position: 'absolute', width: 8, top: '-5%', bottom: '-5%', backgroundColor: '#FFFFFF', transform: [{ rotate: '9deg' }] },
  riderPin: { position: 'absolute', width: 44, height: 44, marginLeft: -22, marginTop: -22, borderRadius: 22, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', elevation: 3, overflow: 'hidden' },
  pinFallback: { color: colors.white, fontSize: 20, fontWeight: '800' },
  riderLogo: { position: 'absolute', width: 40, height: 40, borderRadius: 20 },
  userPin: { position: 'absolute', zIndex: 2, width: 22, height: 22, borderRadius: 12, left: '47%', top: '47%', backgroundColor: colors.green, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  currentUserPin: { backgroundColor: '#3277CB' },
  userDot: { fontSize: 5, color: colors.white },
  mapLabel: { position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: '#FFFFFFDD', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  labelText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
});
