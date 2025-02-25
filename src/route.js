const geojsonhint = require('@mapbox/geojsonhint')
const chalk = require('chalk')
const FsInfo = require('./info.js')
const FsQuery = require('./query.js')
const FsGenerateRenderer = require('./generateRenderer')
const helpers = require('./helpers')

module.exports = route

/**
 * shared logic for handling Feature Service requests
 * most providers will use this method to figure out what request is being made
 *
 * @param  {Object}   req
 * @param  {Object}   res
 * @param  {Object}   geojson
 */
function route (req, res, geojson, options) {
  // Check for valid GeoJSON and warn if not found (non-production environments)
  if (process.env.NODE_ENV !== 'production' && process.env.KOOP_WARNINGS !== 'suppress') {
    let geojsonErrors = geojsonhint.hint(geojson)
    if (geojsonErrors.length > 0) console.log(chalk.yellow(`WARNING: source data for ${req.path} contains invalid GeoJSON.`))
  }

  req.query = req.query || {}
  req.params = req.params || {}
  geojson = geojson || {}
  const metadata = geojson.metadata || {}

  // Query parsing and coersion are now found in Koop;  TODO: Is it still needed here?
  req.query = coerceQuery(req.query)
  Object.keys(req.query).forEach(key => {
    req.query[key] = tryParse(req.query[key])
  })

  // Validate and check limit
  if (req.query.limit && isNaN(req.query.limit)) return helpers.responseHandler(req, res, 400, { error: `Invalid "limit" parameter` })
  else if (req.query.resultRecordCount && isNaN(req.query.resultRecordCount)) return helpers.responseHandler(req, res, 400, { error: `Invalid "resultRecordCount" parameter` })
  if (!req.query.limit) req.query.limit = req.query.resultRecordCount || metadata.maxRecordCount || 2000

  // if this is for a method we can handle like query
  const method = req.params && req.params.method
  switch (method) {
    case 'query':
      return execQuery(req, res, geojson, options)
    case 'generateRenderer':
      return execGenerateRenderer(req, res, geojson, options)
    default:
      return execInfo(req, res, method, geojson)
  }
}

function execQuery (req, res, geojson, options) {
  let response
  try {
    response = FsQuery(geojson, req.query || {})
  } catch (e) {
    if (process.env.NODE_ENV === 'test') console.trace(e)
    return helpers.responseHandler(req, res, (e.code || 500), { error: e.message })
  }
  helpers.responseHandler(req, res, 200, response)
}

function execGenerateRenderer (req, res, geojson, options) {
  let response
  try {
    response = FsGenerateRenderer(geojson, req.query || {})
  } catch (e) {
    if (process.env.NODE_ENV === 'test') console.trace(e)
    return helpers.responseHandler(req, res, (e.code || 500), { error: e.message })
  }
  helpers.responseHandler(req, res, 200, response)
}

function execInfo (req, res, method, geojson) {
  let info
  const url = (req.url || req.originalUrl).split('?')[0]
  try {
    if (/\/rest\/info$/i.test(url)) {
      info = FsInfo.restInfo(geojson)
    } else if (/\/FeatureServer$/i.test(url) || /\/FeatureServer\/info$/i.test(url) || /\/FeatureServer\/($|\?)/.test(url)) {
      info = FsInfo.serverInfo(geojson, req.params)
    } else if (/\/FeatureServer\/\d+$/i.test(url) || /\/FeatureServer\/\d+\/info$/i.test(url) || /\/FeatureServer\/\d+\/($|\?)/.test(url)) {
      info = FsInfo.layerInfo(geojson, req.params)
    } else if (/\/FeatureServer\/layers$/i.test(url)) {
      info = FsInfo.layersInfo(geojson, req.query)
    } else if (/\/FeatureServer/i.test(url)) {
      const error = new Error('Method not supported')
      error.code = 400
      throw error
    } else {
      const error = new Error('Not Found')
      error.code = 404
      throw error
    }
  } catch (e) {
    if (process.env.NODE_ENV === 'test') console.trace(e)
    return helpers.responseHandler(req, res, (e.code || 500), { error: e.message })
  }
  helpers.responseHandler(req, res, 200, info)
}

function tryParse (json) {
  try {
    return JSON.parse(json)
  } catch (e) {
    return json
  }
}

function coerceQuery (params) {
  Object.keys(params).forEach(param => {
    if (params[param] === 'false') params[param] = false
    else if (params[param] === 'true') params[param] = true
  })
  return params
}
