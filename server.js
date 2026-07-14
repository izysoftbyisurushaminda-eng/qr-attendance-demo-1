const express = require('express');
const QRCode = require('qrcode');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cloud Environment එකෙන් MONGO_URI ලබා ගැනීම
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("CRITICAL ERROR: MONGO_URI environment variable is missing!");
} else {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("Connected to MongoDB Atlas Successfully!"))
        .catch(err => console.error("MongoDB Connection Error:", err));
}

// Database Schemas
const teacherSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    department: { type: String, required: true }
});
const Teacher = mongoose.model('Teacher', teacherSchema);

const attendanceSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    department: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true }
});
const Attendance = mongoose.model('Attendance', attendanceSchema);

// 1. QR Code Generator Route
app.get('/admin/generate-qr/:id', async (req, res) => {
    try {
        const teacher = await Teacher.findOne({ id: req.params.id });
        if (!teacher) return res.status(404).send("Teacher not found");
        const qrCodeUrl = await QRCode.toDataURL(teacher.id);
        res.send(`
            <div style="text-align:center; font-family:Arial; margin-top:50px;">
                <h2>QR Code for ${teacher.name} (${teacher.id})</h2>
                <img src="${qrCodeUrl}" alt="QR Code" style="width:250px;"/>
                <br/><br/>
                <button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer;">Print QR Code</button>
            </div>
        `);
    } catch (err) { res.status(500).send("Error generating QR Code"); }
});

// 2. Scan Attendance API
app.post('/api/scan', async (req, res) => {
    try {
        const { teacherId } = req.body;
        const teacher = await Teacher.findOne({ id: teacherId });
        if (!teacher) return res.status(400).json({ success: false, message: "වලංගු නොවන QR කේතයකි." });

        const now = new Date();
        const timeString = now.toLocaleTimeString();
        const dateString = now.toLocaleDateString();

        const alreadyChecked = await Attendance.findOne({ id: teacherId, date: dateString });
        if (alreadyChecked) return res.json({ success: false, message: `${teacher.name} අද දිනට පැමිණීම සටහන් කර ඇත.` });

        const newAttendance = new Attendance({ id: teacher.id, name: teacher.name, department: teacher.department, date: dateString, time: timeString });
        await newAttendance.save();
        res.json({ success: true, message: `${teacher.name} මහතා/මහත්මියගේ පැමිණීම සටහන් විය!` });
    } catch (err) { res.status(500).json({ success: false, message: "Server Error" }); }
});

// 3. Admin Control Panel Route
app.post('/admin/register', async (req, res) => {
    try {
        const { id, name, department } = req.body;
        const exists = await Teacher.findOne({ id });
        if (exists) return res.send("<script>alert('ID already exists!'); window.location='/admin/dashboard';</script>");
        const newTeacher = new Teacher({ id, name, department });
        await newTeacher.save();
        res.redirect('/admin/dashboard');
    } catch (err) { res.status(500).send("Registration failed"); }
});

app.get('/admin/dashboard', async (req, res) => {
    try {
        const allTeachers = await Teacher.find({});
        const todayAttendance = await Attendance.find({ date: new Date().toLocaleDateString() });
        let teacherRows = allTeachers.map(t => `<tr><td><b>${t.id}</b></td><td>${t.name}</td><td>${t.department}</td><td><a href="/admin/generate-qr/${t.id}" target="_blank" style="background:#0056b3; color:white; padding:5px 10px; text-decoration:none; border-radius:4px; font-size:13px;">Issue QR</a></td></tr>`).join('');
        let attendanceRows = todayAttendance.map(log => `<tr><td>${log.id}</td><td><b>${log.name}</b></td><td>${log.department}</td><td style="color:green; font-weight:bold;">${log.time}</td></tr>`).join('');
        res.send(`
            <!DOCTYPE html><html><head><title>Admin Control Panel</title><style>body{font-family:sans-serif; padding:25px; background:#f1f5f9;} .grid{display:flex; gap:20px;} .card{background:white; padding:20px; border-radius:10px; flex:1; box-shadow:0 2px 5px rgba(0,0,0,0.05);} table{width:100%; border-collapse:collapse; margin-top:10px;} th,td{padding:8px; text-align:left; border-bottom:1px solid #eee;} th{background:#f8fafc;} input,select,button{width:100%; padding:10px; margin:10px 0; border-radius:5px; border:1px solid #ccc;} button{background:#10b981; color:white; font-weight:bold; cursor:pointer;}</style></head>
            <body>
                <h2>School Attendance Admin Panel (Live Demo)</h2>
                <div class="grid">
                    <div class="card">
                        <h3>1. Register Teacher</h3>
                        <form action="/admin/register" method="POST">
                            <input type="text" name="id" placeholder="Teacher ID (e.g. T10)" required />
                            <input type="text" name="name" placeholder="Full Name" required />
                            <select name="department"><option value="IT">IT</option><option value="Science">Science</option><option value="Maths">Maths</option></select>
                            <button type="submit">Save Teacher</button>
                        </form>
                    </div>
                    <div class="card"><h3>2. Staff & QR List</h3><table><thead><tr><th>ID</th><th>Name</th><th>Dept</th><th>Action</th></tr></thead><tbody>${teacherRows}</tbody></table></div>
                </div>
                <div class="card" style="margin-top:20px;"><h3>3. Today's Attendance Log</h3><table><thead><tr><th>ID</th><th>Name</th><th>Dept</th><th>Time</th></tr></thead><tbody>${attendanceRows.length > 0 ? attendanceRows : '<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8;">No records found.</td></tr>'}</tbody></table></div>
            </body></html>
        `);
    } catch (err) { res.status(500).send("Error loading dashboard"); }
});

// 4. Public View & Scanner Templates
app.get('/scanner', (req, res) => res.sendFile(path.join(__dirname, 'scanner.html')));

app.get('/dashboard', async (req, res) => {
    try {
        const todayAttendance = await Attendance.find({ date: new Date().toLocaleDateString() });
        let publicRows = todayAttendance.map(log => `<tr><td style="padding:12px; font-size:18px;"><b>${log.name}</b></td><td>${log.department}</td><td style="color:#0056b3; font-weight:bold;">${log.time}</td><td><span style="background:#d1fae5; color:#065f46; padding:4px 10px; border-radius:15px; font-size:13px; font-weight:bold;">Present</span></td></tr>`).join('');
        res.send(`
            <!DOCTYPE html><html><head><title>Live Display</title><meta http-equiv="refresh" content="5"><style>body{font-family:sans-serif; padding:30px; background:#f8fafc;} .box{max-width:900px; margin:0 auto; background:white; padding:25px; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.05);} h1{border-bottom:3px solid #0056b3; padding-bottom:10px;} table{width:100%; border-collapse:collapse; text-align:left;} th{background:#f1f5f9; padding:12px;} td{border-bottom:1px solid #eee; padding:8px;}</style></head>
            <body><div class="box"><h1>ගුරු මණ්ඩල පැමිණීමේ ලේඛනය (Live Display)</h1><table><thead><tr><th>නම (Name)</th><th>අංශය</th><th>වේලාව</th><th>තත්ත්වය</th></tr></thead><tbody>${publicRows.length > 0 ? publicRows : '<tr><td colspan="4" style="text-align:center; padding:30px; color:#aaa;">තවමත් කිසිදු පැමිණීමක් සටහන් වී නැත.</td></tr>'}</tbody></table></div></body></html>
        `);
    } catch (err) { res.status(500).send("Error loading display"); }
});