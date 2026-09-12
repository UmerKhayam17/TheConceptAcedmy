const fs = require('fs');
const path = require('path');

const ACADEMY_BRAND = {
  name: 'The Concept Academy',
  legalName: 'The Concept Educational System',
  tagline: 'Read | Rise | Radiate',
  phones: ['0300-1009989', '0306-1009989'],
  email: 'theconceptacademyislamabad@gmail.com',
  address: 'Islamabad, Pakistan',
  colors: {
    navy: '#0E2A4E',
    navyDark: '#0A1F3A',
    gold: '#E8A317',
    goldLight: '#F5C542',
    muted: '#5A6A7A',
    line: '#D6DEE8',
    zebra: '#F6F8FB',
    white: '#FFFFFF',
  },
};

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, '../../assets/logo.png'),
    path.join(__dirname, '../../../frontend/src/assets/logo.png'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

module.exports = { ACADEMY_BRAND, resolveLogoPath };
