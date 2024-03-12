fx_version "cerulean"
game "gta5"
lua54 "yes"

server_only "yes"

server_script {
	"@oxmysql/lib/MySQL.lua",
	"server/dist/index.js"
}

dependency "oxmysql"
