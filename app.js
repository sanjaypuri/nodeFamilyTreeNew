const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database.js');
const { render } = require('ejs');
const { setTimeout } = require('timers');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

let personsData = [];
let relationsData = [];

const loadRelations = (callback) => {
  const sql = `SELECT
                  rs.id, 
                  rs.person1id, 
                  p1.fname||' '||p1.lname name1,
                  p1.gender gender1, 
                  rs.relationid, 
                  r.relation, 
                  rs.person2id, 
                  p2.fname||' '||p2.lname name2,
                  p2.gender gender2
                FROM relationships rs
                LEFT JOIN persons p1 ON p1.id = rs.person1id
                LEFT JOIN relations r ON r.id = rs.relationid
                LEFT JOIN persons p2 ON p2.id = rs.person2id
                ORDER BY rs.person1id, rs.relationid`;
  db.all(sql, (error, relations) => {
    relationsData = relations;
    callback();
  });
};

const loadPersons = (callback) => {
  const sql = `SELECT
                id, 
                fname,
                lname,
                gender,
                dob,
                iif(dob is not null,
                  iif(isalive=1,
                    'Now '||CAST(Date('now')-Date(dob) AS TEXT),
                    iif(dod is not null,
                      'Was '|| CAST(Date(dod)-Date(dob) AS TEXT),
                      'Age Unknown')),
                  'Age unknown') age,
                isalive,
                dod,
                iif(dod is not null,CAST(Date('now')-Date(dod) AS TEXT)||' Years Ago',iif(isalive=0,'Died (When?)' ,null )) died,
                dom,
                iif(dom is not null, 'Married '||CAST(Date('now')-Date(dom) AS TEXT)||' Years Ago',null)||iif(dob is not null, ", At age "||CAST(Date(dom)-Date(dob) AS TEXT), "") married
              FROM persons 
              order by id`;
  db.all(sql, (error, persons) => {
    personsData = persons;
    callback();
  });
};

app.get('/', (request, response) => {
  loadPersons(() => {
    loadRelations(() => {
      const displayMessage = {
        text: `Persons loaded: ${personsData.length}, Relations loaded : ${relationsData.length}`,
        background: 'blue',
      };
      response.render('home', { displayMessage });
    });
  });
});

app.get('/persons', (request, response) => {
  const displayMessage = { text: '', background: '' };
  personsData.sort((a, b) => a.fname.localeCompare(b.fname));
  response.render('persons', { displayMessage, personsData });
});

app.get('/personview/:id/:fname/:lname', (request, response) => {
  const id = parseInt(request.params.id);
  const fname = request.params.fname;
  const lname = request.params.lname;
  const person = personsData.find((item) => item.id === id);
  if (!person) {
    const displayMessage = {
      text: `${fname} ${lname} not found`,
      background: 'red',
    };
    personsData.sort((a, b) => a.fname.localeCompare(b.fname));
    return response.render('persons', { displayMessage, personsData });
  }
  const displayMessage = { text: '', background: '' };
  response.render('personview', { person, displayMessage });
});

app.get('/personview/:id/:fname', (request, response) => {
  const id = parseInt(request.params.id);
  const fname = request.params.fname;
  const person = personsData.find((item) => item.id === id);
  if (!person) {
    const displayMessage = { text: `${fname} not found`, background: 'red' };
    personsData.sort((a, b) => a.fname.localeCompare(b.fname));
    return response.render('persons', { displayMessage, personsData });
  }
  const displayMessage = { text: '', background: '' };
  response.render('personview', { person, displayMessage });
});

app.get('/personadd', (request, response) => {
  const displayMessage = { text: '', background: '' };
  response.render('personadd', { displayMessage });
});

app.post('/personadd', async (request, response) => {
  const rec = {};
  rec.fname = request.body.fname.trim();
  rec.lname = request.body.lname.trim();
  rec.dob = request.body.dob;
  rec.dod = request.body.dod;
  if (rec.dob == '') {
    rec.dob = null;
  }
  if (rec.dod == '') {
    rec.dod = null;
  }
  if (request.body.isalive == '') {
    rec.isalive = 1;
    rec.dod = null;
  } else {
    rec.isalive = 0;
  }
  const person = personsData.find(
    (item) =>
      item.fname.toLowerCase() === rec.fname.toLowerCase() &&
      item.lname.toLowerCase() === rec.lname.toLowerCase()
  );
  if (person) {
    const displayMessage = {
      text: `${rec.fname} ${rec.lname} already exists`,
      background: 'red',
    };
    personsData.sort((a, b) => a.fname.localeCompare(b.fname));
    response.render('persons', { displayMessage, personsData });
  }

  const sql = `INSERT INTO persons 
  (fname, lname, gender, dob, isalive, dod) 
  VALUES (?, ?, ?, ?, ?, ?)`;

  db.run(sql, [fname, lname, gender, isalive, dob, dod], (error) => {
    if (error) {
      const displayMessage = {
        text: `Database Error: Could not add ${rec.fname} ${rec.lname}`,
        background: 'red',
      };
      personsData.sort((a, b) => a.fname.localeCompare(b.fname));
      return response.render('persons', { displayMessage, personsData });
    }
    loadPersons(() => {
      const displayMessage = {
        text: `Added ${rec.fname} ${rec.lname} successfully`,
        background: 'green',
      };
      personsData.sort((a, b) => a.fname.localeCompare(b.fname));
      response.render('persons', { displayMessage, personsData });
    });
  });
});

app.get('/persondelete/:id/:fname/:lname', (request, response) => {
  const id = parseInt(request.params.id);
  const fname = request.params.fname;
  const lname = request.params.lname;
  const person = personsData.find((item) => item.id === id);
  if (!person) {
    const displayMessage = {
      text: `${fname} ${lname} not found`,
      background: 'red',
    };
    return response.render('persons', { displayMessage, personsData });
  }
  const relations = relationsData.filter((item) => {
    return item.person1id == id;
  });
  if (relations.length) {
    const displayMessage = {
      text: `Cannot delete ${fname} ${lname}. Relations already exists`,
      background: 'red',
    };
    return response.render('persons', { displayMessage, personsData });
  }
  const sql = `DELETE FROM persons
                  WHERE id = ?`;
  db.run(sql, id, (error) => {
    if (error) {
      const displayMessage = {
        text: `Database Error: Could not delete ${fname} ${lname}`,
        background: 'red',
      };
      return response.render('persons', { displayMessage, personsData });
    }
    personsData = personsData.filter((item) => {
      return item.id != id;
    });
    const displayMessage = {
      text: `${fname} ${lname} deleted`,
      background: 'red',
    };
    return response.render('persons', { displayMessage, personsData });
  });
});

app.get('/persondelete/:id/:fname', (request, response) => {
  const id = parseInt(request.params.id);
  const fname = request.params.fname;
  const person = personsData.find((item) => item.id === id);
  if (!person) {
    const displayMessage = { text: `${fname} not found`, background: 'red' };
    return response.render('persons', { displayMessage, personsData });
  }
  const relations = relationsData.filter((item) => {
    return item.person1id == id;
  });
  if (relations.length) {
    const displayMessage = {
      text: `Cannot delete ${fname}. Relations already exists`,
      background: 'red',
    };
    return response.render('persons', { displayMessage, personsData });
  }
  const sql = `DELETE FROM persons
                  WHERE id = ?`;
  db.run(sql, id, (error) => {
    if (error) {
      const displayMessage = {
        text: `Database Error: Could not delete ${fname}`,
        background: 'red',
      };
      return response.render('persons', { displayMessage, personsData });
    }
    personsData = personsData.filter((item) => {
      return item.id != id;
    });
    const displayMessage = { text: `${fname} deleted`, background: 'red' };
    return response.render('persons', { displayMessage, personsData });
  });
});

app.get('/personedit/:id/:fname/:lname', (request, response) => {
  const id = parseInt(request.params.id);
  const fname = request.params.fname;
  const lname = request.params.lname;
  const person = personsData.find((item) => item.id === id);
  if (!person) {
    const displayMessage = {
      text: `${fname} ${lname} not found`,
      background: 'red',
    };
    personsData.sort((a, b) => a.fname.localeCompare(b.fname));
    return response.render('persons', { displayMessage, personsData });
  }
  const displayMessage = { text: '', background: '' };
  response.render('personedit', { person, displayMessage });
});

app.get('/personedit/:id/:fname', (request, response) => {
  const id = parseInt(request.params.id);
  const fname = request.params.fname;
  const person = personsData.find((item) => item.id === id);
  if (!person) {
    const displayMessage = { text: `${fname} not found`, background: 'red' };
    personsData.sort((a, b) => a.fname.localeCompare(b.fname));
    return response.render('persons', { displayMessage, personsData });
  }
  const displayMessage = { text: '', background: '' };
  response.render('personedit', { person, displayMessage });
});

app.post('/personedit', (request, response) => {
  const rec = {};
  rec.fname = request.body.fname.trim();
  rec.lname = request.body.lname.trim();
  rec.dob = request.body.dob;
  rec.dod = request.body.dod;
  if (rec.dob == '') {
    rec.dob = null;
  }
  if (rec.dod == '') {
    rec.dod = null;
  }
  if (request.body.isalive == '') {
    rec.isalive = 1;
    rec.dod = null;
  } else {
    rec.isalive = 0;
  }
  const person = personsData.find(
    (item) =>
      item.fname.toLowerCase() === rec.fname.toLowerCase() &&
      item.lname.toLowerCase === rec.lname.toLowerCase &&
      item.id != id
  );
  if (person) {
    const displayMessage = {
      text: `${rec.fname} ${rec.lname} already exists`,
      background: 'red',
    };
    personsData.sort((a, b) => a.fname.localeCompare(b.fname));
    return response.render('persons', { displayMessage, personsData });
  }
  const sql = `UPDATE persons 
  SET fname = ?, lname = ?, gender = ?, dob = ?, isalive = ?, dod = ? WHERE id = ?`;
  db.run(sql, [fname, lname, gender, isalive, dob, dod, id], (error) => {
    if (error) {
      console.log(error);
      const displayMessage = {
        text: `Database Error: Could not add ${rec.fname} ${rec.lname}`,
        background: 'red',
      };
      personsData.sort((a, b) => a.fname.localeCompare(b.fname));
      return response.render('persons', { displayMessage, personsData });
    }
    loadPersons(() => {
      const displayMessage = {
        text: `Updated ${rec.fname} ${rec.lname} successfully`,
        background: 'green',
      };
      personsData.sort((a, b) => a.fname.localeCompare(b.fname));
      response.render('persons', { displayMessage, personsData });
    });
  });
});

app.get('/relations/:id/:fname/:lname', (request, response) => {
  const id = parseInt(request.params.id);
  const fname = request.params.fname;
  const lname = request.params.lname;
  const relations = relationsData.filter((item) => item.person1id === id);
  if (relations.length == 0) {
    const displayMessage = {
      text: `No relations for for ${fname} ${lname}`,
      background: 'red',
    };
    return response.render('persons', { displayMessage, personsData });
  }
  const displayMessage = {
    text: `No relations for for ${fname} ${lname}`,
    background: 'red',
  };
  // response.send(relations);
  const sons = relations.filter((item)=> item.relationid == 5);
  const daughters = relations.filter((item)=> item.relationid == 6);
  const brothers = relations.filter((item)=> item.relationid == 7);
  const sisters = relations.filter((item)=> item.relationid == 8);
  // return response.send({sons, daughters, brothers, sisters});
  response.render('relationsview', { relations, sons, daughters, brothers, sisters, displayMessage });
});

app.get('*', (request, response) => {
  const displayMessage = {
    text: `The page you are trying to reach in not available`,
    background: 'red',
  };
  response.render('home', { displayMessage });
});

app.listen(5000, () => {
  console.log('Server started at port 5000');
});
