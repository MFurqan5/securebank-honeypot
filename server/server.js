const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
const loginRoute = require('./routes/login.route')
const searchRoute = require('./routes/search.route')
const commentsRoute = require('./routes/comments.route')
const downloadRoute = require('./routes/download.route')

app.use('/api/login', loginRoute)
app.use('/api/search', searchRoute)
app.use('/api/comments', commentsRoute)
app.use('/api/download', downloadRoute)

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'SecureBank Honeypot Server Running' })
})

const PORT = process.env.HONEYPOT_PORT || 5000
app.listen(PORT, () => {
  console.log(`Honeypot server running on port ${PORT}`)
})