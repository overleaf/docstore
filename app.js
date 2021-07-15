/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const Metrics = require('@overleaf/metrics')
Metrics.initialize('docstore')
const Settings = require('@overleaf/settings')
const logger = require('logger-sharelatex')
const express = require('express')
const bodyParser = require('body-parser')
const {
  celebrate: validate,
  Joi,
  errors: handleValidationErrors,
} = require('celebrate')
const mongodb = require('./app/js/mongodb')
const Errors = require('./app/js/Errors')
const HttpController = require('./app/js/HttpController')

logger.initialize('docstore')
if (Metrics.event_loop != null) {
  Metrics.event_loop.monitor(logger)
}

const app = express()

app.use(Metrics.http.monitor(logger))

Metrics.injectMetricsRoute(app)

app.param('project_id', function (req, res, next, projectId) {
  if (projectId != null ? projectId.match(/^[0-9a-f]{24}$/) : undefined) {
    return next()
  } else {
    return next(new Error('invalid project id'))
  }
})

app.param('doc_id', function (req, res, next, docId) {
  if (docId != null ? docId.match(/^[0-9a-f]{24}$/) : undefined) {
    return next()
  } else {
    return next(new Error('invalid doc id'))
  }
})

Metrics.injectMetricsRoute(app)

app.get('/project/:project_id/doc-deleted', HttpController.getAllDeletedDocs)
app.get('/project/:project_id/doc', HttpController.getAllDocs)
app.get('/project/:project_id/ranges', HttpController.getAllRanges)
app.get('/project/:project_id/doc/:doc_id', HttpController.getDoc)
app.get('/project/:project_id/doc/:doc_id/deleted', HttpController.isDocDeleted)
app.get('/project/:project_id/doc/:doc_id/raw', HttpController.getRawDoc)
// Add 64kb overhead for the JSON encoding, and double the size to allow for ranges in the json payload
app.post(
  '/project/:project_id/doc/:doc_id',
  bodyParser.json({ limit: (Settings.max_doc_length + 64 * 1024) * 2 }),
  HttpController.updateDoc
)
app.patch(
  '/project/:project_id/doc/:doc_id',
  bodyParser.json(),
  validate({
    body: {
      deleted: Joi.boolean(),
      name: Joi.string().when('deleted', { is: true, then: Joi.required() }),
      deletedAt: Joi.date().when('deleted', { is: true, then: Joi.required() }),
    },
  }),
  HttpController.patchDoc
)
app.delete('/project/:project_id/doc/:doc_id', (req, res) => {
  res.status(500).send('DELETE-ing a doc is DEPRECATED. PATCH the doc instead.')
})

app.post('/project/:project_id/archive', HttpController.archiveAllDocs)
app.post('/project/:project_id/doc/:doc_id/archive', HttpController.archiveDoc)
app.post('/project/:project_id/unarchive', HttpController.unArchiveAllDocs)
app.post('/project/:project_id/destroy', HttpController.destroyAllDocs)

app.get('/health_check', HttpController.healthCheck)

app.get('/status', (req, res) => res.send('docstore is alive'))

app.use(handleValidationErrors())
app.use(function (error, req, res, next) {
  logger.error({ err: error, req }, 'request errored')
  if (error instanceof Errors.NotFoundError) {
    return res.sendStatus(404)
  } else {
    return res.status(500).send('Oops, something went wrong')
  }
})

const { port } = Settings.internal.docstore
const { host } = Settings.internal.docstore

if (!module.parent) {
  // Called directly
  mongodb
    .waitForDb()
    .then(() => {
      app.listen(port, host, function (err) {
        if (err) {
          logger.fatal({ err }, `Cannot bind to ${host}:${port}. Exiting.`)
          process.exit(1)
        }
        return logger.info(`Docstore starting up, listening on ${host}:${port}`)
      })
    })
    .catch(err => {
      logger.fatal({ err }, 'Cannot connect to mongo. Exiting.')
      process.exit(1)
    })
}

module.exports = app
