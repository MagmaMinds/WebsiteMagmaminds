require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Database connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// GET /api/courses?categoryId=1
app.get('/api/courses', (req, res) => {
  const categoryId = req.query.categoryId;
  console.log(categoryId, "yesssssssss");

  let query = `
    SELECT c.id, c.name, c.price, c.duration, cc.name AS category
    FROM courses c
    JOIN course_categories cc ON c.category_id = cc.id
  `;

  const params = [];

  // Filter by categoryId if provided
  if (categoryId) {
    query += ' WHERE c.category_id = ?';
    params.push(categoryId);
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching courses:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    // Group results by category name
    const grouped = results.reduce((acc, course) => {
      const category = course.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push({
        id: course.id,
        name: course.name,
        price: course.price,
        duration: course.duration
      });
      return acc;
    }, {});

    res.json(grouped);
  });
});


// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Mail setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.post('/api/apply', (req, res) => {
  const { name, email, phone, course } = req.body;
  console.log(course, "checking");

  if (!name || !email || !phone || !course) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const query = 'INSERT INTO applications (name, email, phone, course) VALUES (?, ?, ?, ?)';
  db.query(query, [name, email, phone, course], (err, result) => {
    if (err) {
      console.error('Error inserting application:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    const mailOptions = {
      from: 'Your Company <youremail@yourdomain.com>',
      to: 'magmaminds@gmail.com',
      subject: `New Application: ${name} - ${course}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #58aecbff;">New Application Received</h2>
          <p>You have a new course application from <strong>${name}</strong>.</p>
          <hr style="border: 0; border-top: 1px solid #eee;">
          <h3>Applicant Details:</h3>
          <ul style="list-style-type: none; padding: 0;">
            <li><strong>Name:</strong> ${name}</li>
            <li><strong>Email:</strong> <a href="mailto:${email}">${email}</a></li>
            <li><strong>Phone:</strong> ${phone}</li>
            <li><strong>Selected Course:</strong> ${course}</li>
          </ul>
          <br>
          <p style="font-size: 0.9em; color: #777;">
            This is an automated notification. You can review the full application in your dashboard.
          </p>
        </div>
      `,
      text: `New application received from ${name} for the ${course} course. Details: Name: ${name}, Email: ${email}, Phone: ${phone}, Course: ${course}.`,
    };

    transporter.sendMail(mailOptions, (emailErr, info) => {
      if (emailErr) {
        console.error('Error sending email:', emailErr);
      } else {
        console.log('Email sent:', info.response);
      }

      client.messages
        .create({
          body: `📩 *New Application Received!*

👤 *Name:* ${name}
📧 *Email:* ${email}
📱 *Phone:* ${phone}
📚 *Course:* ${course}

🕒 Submitted on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,

          from: 'whatsapp:+14155238886',
          to: 'whatsapp:+919344164220',
        })

        .then(message => {
          console.log('WhatsApp message sent:', message.sid);
          res.status(201).json({ message: 'Application submitted successfully', id: result.insertId });
        })
        .catch(whatsappErr => {
          console.error('Error sending WhatsApp:', whatsappErr);
          res.status(201).json({
            message: 'Application submitted successfully, but failed to send WhatsApp',
            id: result.insertId
          });
        });
    });
  });
});



app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});