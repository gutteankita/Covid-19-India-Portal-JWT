const express = require('express')

const app = express()
app.use(express.json())

const bcrypt = require('bcrypt')

const jwt = require('jsonwebtoken')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const path = require('path')
const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeDatabaseAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
  } catch (e) {
    console.log(`DB Error: '${e.message}'`)
  }
}

initializeDatabaseAndServer()

const authenticateToken = (request, response, next) => {
  const authHeaders = request.headers['authorization']

  if (authHeaders === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    const jwtToken = authHeaders.split(' ')[1]

    jwt.verify(jwtToken, 'qwerty', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        // console.log('Authenticated user:', request.username)
        next()
      }
    })
  }
}

app.get('/states/', authenticateToken, async (request, response) => {
  const selectQuery = `
        SELECT * FROM state ORDER BY state_id;`
  const data = await db.all(selectQuery)
  const modifiedStateArray = data.map(state => ({
    stateId: state.state_id,
    stateName: state.state_name,
    population: state.population,
  }))

  response.send(modifiedStateArray)
})

app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
        SELECT * FROM state WHERE state_id = "${stateId}";`
  const state = await db.get(getStateQuery)
  const formattedState = {
    stateId: state.state_id,
    stateName: state.state_name,
    population: state.population,
  }

  response.send(formattedState)
})

app.post('/districts/', authenticateToken, async (request, response) => {
  const districtDetails = request.body
  const {districtName, stateId, cases, cured, active, deaths} = districtDetails
  const addQuery = `
      INSERT INTO district 
        (district_name, state_id, cases, cured, active, deaths)
      VALUES (
        "${districtName}",
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths}
      );
     `
  await db.run(addQuery)
  response.send('District Successfully Added')
})

app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `SELECT * FROM district WHERE district_id = ${districtId};`
    const district = await db.get(getDistrictQuery)
    const formattedState = {
      districtId: district.district_id,
      districtName: district.district_name,
      stateId: district.state_id,
      cases: district.cases,
      cured: district.cured,
      active: district.active,
      deaths: district.deaths,
    }

    response.send(formattedState)
  },
)

app.post('/login', async (request, response) => {
  const {username, password} = request.body
  const selectQuery = `SELECT * FROM user WHERE username = "${username}";`
  const dbUser = await db.get(selectQuery)

  if (!dbUser) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const passwordCheck = await bcrypt.compare(password, dbUser.password)
    if (passwordCheck === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'qwerty')
      response.send({jwtToken})
      // response.send('login success')
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteQuery = `DELETE from district WHERE district_id = ${districtId};`
    await db.run(deleteQuery)
    response.send('District Removed')
  },
)

app.put('/districts/:districtId/', authenticateToken, async (request, response) => {
  const {districtId} = request.params
  const districtDetails = request.body
  const {districtName, stateId, cases, cured, active, deaths} = districtDetails

  const updateQuery = `
      UPDATE district SET 
      district_name = '${districtName}',
      state_id = '${stateId}',
      cases = ${cases},
      cured = ${cured},
      active = '${active}',
      deaths = '${deaths}'
      WHERE district_id = ${districtId}
    `
  await db.run(updateQuery)
  response.send('District Details Updated')
})

app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStatistics = `
            SELECT
              SUM(d.cases) AS totalCases,
              SUM(d.cured) AS totalCured,
              SUM(d.active) AS totalActive,
              SUM(d.deaths) AS totalDeaths
            FROM
              state s
            INNER JOIN
              district d
            ON
              d.state_id = s.state_id
            WHERE
              d.state_id = ${stateId}
            ;`

    const statsData = await db.get(getStatistics)
    const formattedData = {
      totalCases: statsData.totalCases,
      totalCured: statsData.totalCured,
      totalActive: statsData.totalActive,
      totalDeaths: statsData.totalDeaths,
    }

    response.json(formattedData)
  },
)

module.exports = app
