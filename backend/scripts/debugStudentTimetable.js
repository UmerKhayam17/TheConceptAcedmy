require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const AcademyStudent = require('../src/models/academy/AcademyStudent');
const studentRecordService = require('../src/services/academy/academyStudentRecordService');

async function run(studentId) {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/academy_management';
    await mongoose.connect(mongoUri);
    try {
        const student = await AcademyStudent.findById(studentId)
            .populate('classId', 'className sessionId')
            .populate('sectionId', 'sectionName');
        console.log('student:', student ? student.toJSON() : null);
        const record = await studentRecordService.getStudentRecord(studentId);
        console.log('record.timetable length:', record.timetable.length);
        console.log('record.timetable:', JSON.stringify(record.timetable, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

const id = process.argv[2];
if (!id) {
    console.error('Usage: node scripts/debugStudentTimetable.js <studentId>');
    process.exit(1);
}
run(id);
