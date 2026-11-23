import React, { useEffect, useRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { colors, platformColor } from '../utils/colors';

const platformLogos = {
  Angkas: require('../assets/logos/angkas.png'),
  'Move It': require('../assets/logos/move-it.png'),
  JoyRide: require('../assets/logos/joyride.png'),
};

export default function RiderMap({ riders, location, locationGranted, onSelectRider }) {
  const mapRef = useRef(null);
  const region = { ...location, latitudeDelta: 0.035, longitudeDelta: 0.035 };

  useEffect(() => {
    mapRef.current?.animateToRegion(region, 450);
  }, [location.latitude, location.longitude]);

  return (
    <MapView ref={mapRef} style={styles.map} initialRegion={region} showsUserLocation={locationGranted} showsMyLocationButton={false}>
      {riders.map((rider) => (
        <Marker
          key={rider.id}
          coordinate={{ latitude: rider.latitude, longitude: rider.longitude }}
          title={rider.platform}
          description={`${rider.id} · simulated`}
          onPress={() => onSelectRider(rider)}
        >
          <View style={[styles.marker, { backgroundColor: platformColor(rider.platform) }]}>
            <Text style={styles.markerFallback}>{rider.platform === 'Move It' ? 'M' : rider.platform[0]}</Text>
            <Image source={platformLogos[rider.platform]} style={styles.markerImage} resizeMode="contain" />
          </View>
        </Marker>
      ))}
      {!locationGranted ? <Marker coordinate={location} pinColor={colors.green} title="You" description="Demonstration location" /> : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  marker: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  markerFallback: { color: colors.white, fontSize: 20, fontWeight: '800' },
  markerImage: { position: 'absolute', width: 40, height: 40, borderRadius: 20 },
});
