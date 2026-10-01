require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/academy_management';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const records = await db.collection('feerecords').find({}).project({
    feeType: 1,
    month: 1,
    year: 1,
    amount: 1,
    status: 1,
    studentId: 1,
    receiptNumber: 1,
  }).toArray();
  const students = await db.collection('students').find({
    _id: { $in: records.map((row) => row.studentId) },
  }).project({ studentName: 1, studentId: 1 }).toArray();
  const byId = new Map(students.map((student) => [String(student._id), student]));
  console.log(JSON.stringify(records.map((row) => ({
    id: String(row._id),
    feeType: row.feeType,
    month: row.month,
    year: row.year,
    amount: row.amount,
    status: row.status,
    receiptNumber: row.receiptNumber || '',
    student: byId.get(String(row.studentId))?.studentName || '',
    code: byId.get(String(row.studentId))?.studentId || '',
  })), null, 2));
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
