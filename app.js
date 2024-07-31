const express = require('express');
const bodyParser = require('body-parser');
const db = require('./database.js');
const { render } = require('ejs');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

app.get('/', (request, response)=>{
  response.render('home');
});

app.listen(5000, ()=>{
  console.log('Server started at port 5000');
});