const express = require('express')
const path = require('path')
const IndexController = require('./controllers/index')
const app = express()
const port = 3000

// untuk Tailwindcsss
app.use(express.static(path.join(__dirname, '../public')));

// Set view engine EJS
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

// Controller
const indexController = new IndexController()

// Route utama
app.get('/', (req, res) => indexController.getHome(req, res))

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})