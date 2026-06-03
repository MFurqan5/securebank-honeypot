const express = require('express')
const router = express.Router()

router.post('/', (req, res) => {
  const { username, password } = req.body
  res.json({ message: 'login route working', username })
})

module.exports = router