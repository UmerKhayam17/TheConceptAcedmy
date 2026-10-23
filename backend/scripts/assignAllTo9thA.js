/**
 * Assign every student to Class "9th" / Section "A".
 *
 * Usage (from backend/):
 *   node scripts/assignAllTo9thA.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/academy_management';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const ninth = await db.collection('classes').findOne({
    className: { $regex: /^9th$/i },
    status: 'active',
  });
  if (!ninth) throw new Error('Active class "9th" not found');

  const sectionA = await db.collection('sections').findOne({
    classId: ninth._id,
    sectionName: { $regex: /^A$/i },
    status: 'active',
  });
  if (!sectionA) throw new Error('Active section "A" not found under class 9th');

  const before = await db.collection('students').countDocuments();
  const already = await db.collection('students').countDocuments({
    classId: ninth._id,
    sectionId: sectionA._id,
  });

  const result = await db.collection('students').updateMany(
    {},
    {
      $set: {
        classId: ninth._id,
        sectionId: sectionA._id,
      },
    }
  );

  const after = await db.collection('students').countDocuments({
    classId: ninth._id,
    sectionId: sectionA._id,
  });

  console.log(
    JSON.stringify(
      {
        class: { id: String(ninth._id), name: ninth.className },
        section: { id: String(sectionA._id), name: sectionA.sectionName },
        totalStudents: before,
        alreadyOn9thA: already,
        matched: result.matchedCount,
        modified: result.modifiedCount,
        nowOn9thA: after,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
