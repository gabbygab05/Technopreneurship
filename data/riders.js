// All coordinates, fares, ETAs, and availability are made-up demonstration data.
export const riders = [
  { id: 'ANG-001', platform: 'Angkas', name: 'Rider ANG-001', latitude: 8.4820, longitude: 124.6470, eta: 4, estimatedFare: 75 },
  { id: 'ANG-002', platform: 'Angkas', name: 'Rider ANG-002', latitude: 8.4771, longitude: 124.6450, eta: 6, estimatedFare: 85 },
  { id: 'ANG-003', platform: 'Angkas', name: 'Rider ANG-003', latitude: 8.4860, longitude: 124.6500, eta: 7, estimatedFare: 90 },
  { id: 'ANG-004', platform: 'Angkas', name: 'Rider ANG-004', latitude: 8.4790, longitude: 124.6540, eta: 5, estimatedFare: 70 },
  { id: 'ANG-005', platform: 'Angkas', name: 'Rider ANG-005', latitude: 8.4880, longitude: 124.6420, eta: 9, estimatedFare: 95 },
  { id: 'MOV-001', platform: 'Move It', name: 'Rider MOV-001', latitude: 8.4840, longitude: 124.6500, eta: 6, estimatedFare: 65 },
  { id: 'MOV-002', platform: 'Move It', name: 'Rider MOV-002', latitude: 8.4800, longitude: 124.6410, eta: 8, estimatedFare: 80 },
  { id: 'MOV-003', platform: 'Move It', name: 'Rider MOV-003', latitude: 8.4900, longitude: 124.6480, eta: 5, estimatedFare: 70 },
  { id: 'MOV-004', platform: 'Move It', name: 'Rider MOV-004', latitude: 8.4750, longitude: 124.6510, eta: 10, estimatedFare: 95 },
  { id: 'MOV-005', platform: 'Move It', name: 'Rider MOV-005', latitude: 8.4870, longitude: 124.6560, eta: 7, estimatedFare: 85 },
  { id: 'JOY-001', platform: 'JoyRide', name: 'Rider JOY-001', latitude: 8.4790, longitude: 124.6440, eta: 8, estimatedFare: 80 },
  { id: 'JOY-002', platform: 'JoyRide', name: 'Rider JOY-002', latitude: 8.4850, longitude: 124.6390, eta: 6, estimatedFare: 75 },
  { id: 'JOY-003', platform: 'JoyRide', name: 'Rider JOY-003', latitude: 8.4730, longitude: 124.6470, eta: 11, estimatedFare: 100 },
  { id: 'JOY-004', platform: 'JoyRide', name: 'Rider JOY-004', latitude: 8.4910, longitude: 124.6530, eta: 9, estimatedFare: 90 },
  { id: 'JOY-005', platform: 'JoyRide', name: 'Rider JOY-005', latitude: 8.4830, longitude: 124.6570, eta: 5, estimatedFare: 70 },
].map((rider) => ({ ...rider, status: 'Simulated' }));
