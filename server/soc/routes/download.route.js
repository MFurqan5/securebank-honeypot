const express = require('express')
const router = express.Router()

router.get('/', (req, res) => {
  res.json({ message: 'download route working' })
})

module.exports = router