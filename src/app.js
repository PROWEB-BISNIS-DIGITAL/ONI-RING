const express = require('express')
const path = require('path')
const IndexController = require('./controllers/index')
const app = express()
const port = 3000

// Set view engine EJS
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

// Controller
const indexController = new IndexController()

// Route utama
app.get('/', (req, res) => indexController.getIndex(req, res))
app.get('/home', (req, res) => indexController.getHome(req, res))

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})