http = require('http')
fs = require('fs')
http.globalAgent.maxSockets = 300

module.exports = Settings =
	internal:
		docstore:
			port: 3016
			host: process.env['LISTEN_ADDRESS'] or "localhost"

	mongo:
		url: "mongodb://#{process.env['MONGO_HOST'] or '127.0.0.1'}/sharelatex"

	docstore:
		healthCheck:
			project_id: ""

	max_doc_length: 2 * 1024 * 1024 # 2mb

if process.env['AWS_ACCESS_KEY_ID']? and process.env['AWS_SECRET_ACCESS_KEY']? and process.env['AWS_BUCKET']?
	Settings.docstore.s3 =
		key: process.env['AWS_ACCESS_KEY_ID']
		secret: process.env['AWS_SECRET_ACCESS_KEY']
		bucket: process.env['AWS_BUCKET']

try
  config = require('/run/secrets/config.json')
  Settings.docstore.s3 = config['S3_DOCSTORE_TEST_AWS_KEYS']
catch e
  console.log "Unable to open config.json"


console.log "SETTINGS"
console.log Settings.docstore.s3
