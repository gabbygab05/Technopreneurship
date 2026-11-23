import { riders } from '../data/riders';

// A tiny mock API. The short delay makes the service behave like a network request.
const wait = () => new Promise((resolve) => setTimeout(resolve, 180));

export async function getNearbyRiders() {
  await wait();
  return riders;
}

export async function getRidersByPlatform(platform) {
  await wait();
  return platform === 'All' ? riders : riders.filter((rider) => rider.platform === platform);
}

export async function getRiderById(id) {
  await wait();
  return riders.find((rider) => rider.id === id) || null;
}

export async function getEstimatedFare(riderId) {
  const rider = await getRiderById(riderId);
  return rider ? rider.estimatedFare : null;
}
