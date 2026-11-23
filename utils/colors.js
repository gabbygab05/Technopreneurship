export const colors = {
  green: '#16845B',
  greenDark: '#0B6241',
  mint: '#E8F5EF',
  ink: '#17231E',
  muted: '#738078',
  line: '#E8EDE9',
  canvas: '#F5F8F6',
  angkas: '#10AEE5',
  moveIt: '#f20202',
  joyRide: '#0c04f9',
  white: '#FFFFFF',
};

export const platformColor = (platform) => ({
  Angkas: colors.angkas,
  'Move It': colors.moveIt,
  JoyRide: colors.joyRide,
}[platform] || colors.green);
