import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./src/data/fwdnetworks.json', 'utf8'));

// Add date property for timeline (uses 'from' as date)
const versions = data.versions.map(v => ({
  label: v.label,
  from: v.from,
  to: v.to,
  breaking: v.breaking,
  diff: v.diff,
  stats: v.stats,
  date: v.from  // Add date property for VersionTimeline
}));

fs.writeFileSync('./src/data/fwdnetworks.json', JSON.stringify({ ...data, versions }, null, 2));
console.log('Done! Added date property to', versions.length, 'versions');
