Settings   = require "settings-sharelatex"
logger     = require "logger-sharelatex"
express    = require "express"
bodyParser = require "body-parser"
Errors     = require "./app/js/Errors"
HttpController = require "./app/js/HttpController"
Metrics    = require "metrics-sharelatex"
Path       = require "path"

Metrics.initialize("docstore")
logger.initialize("docstore")
Metrics.event_loop?.monitor(logger)

app = express()


app.use Metrics.http.monitor(logger)

app.param 'project_id', (req, res, next, project_id) ->
	if project_id?.match /^[0-9a-f]{24}$/
		next()
	else
		next new Error("invalid project id")

app.param 'doc_id', (req, res, next, doc_id) ->
	if doc_id?.match /^[0-9a-f]{24}$/
		next()
	else
		next new Error("invalid doc id")

Metrics.injectMetricsRoute(app)

app.get  '/project/:project_id/doc', HttpController.getAllDocs
app.get  '/project/:project_id/ranges', HttpController.getAllRanges
app.get  '/project/:project_id/doc/:doc_id', HttpController.getDoc
app.get  '/project/:project_id/doc/:doc_id/raw', HttpController.getRawDoc
# Add 16kb overhead for the JSON encoding
app.post '/project/:project_id/doc/:doc_id', bodyParser.json(limit: Settings.max_doc_length + 16 * 1024), HttpController.updateDoc
app.del  '/project/:project_id/doc/:doc_id', HttpController.deleteDoc

app.post  '/project/:project_id/archive', HttpController.archiveAllDocs
app.post  '/project/:project_id/unarchive', HttpController.unArchiveAllDocs

app.get "/health_check",  HttpController.healthCheck


leaks = []
crypto = require("crypto")
app.get '/blow_memory', (req, res, next)->
	for i in [0...10]
		leaks.push(crypto.randomBytes(1024 * 1024).toString('hex'))

	res.send(leaks.length.toString())


app.get '/blow_cpu', (req, res, next)->
	for i in [0...100]
		crypto.randomBytes(1024 * 1024).toString('hex')
		process.nextTick ->
			global.gc()
	res.send("processed")

app.get '/status', (req, res)->
	res.send('docstore is alive')

app.use (error, req, res, next) ->
	logger.error err: error, "request errored"
	if error instanceof Errors.NotFoundError
		res.send 404
	else
		res.send(500, "Oops, something went wrong")

port = Settings.internal.docstore.port
host = Settings.internal.docstore.host

if !module.parent # Called directly
	app.listen port, host, (error) ->
		throw error if error?
		logger.info "Docstore starting up, listening on #{host}:#{port}"


if Settings.crash == true
	setTimeout(process.exit, 1000)



module.exports = app