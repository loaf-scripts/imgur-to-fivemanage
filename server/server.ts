import fetch, { FormData, File } from 'node-fetch'
import { oxmysql as MySQL } from '@overextended/oxmysql'

const delay = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const rawConfig = LoadResourceFile(GetCurrentResourceName(), 'config.json')

if (!rawConfig) throw new Error('Failed to load config.json')

const config = JSON.parse(rawConfig) as {
    photoToken: string
    videoToken: string
    requestsPerMinute: number
    extensions: {
        image: string[]
        video: string[]
    }
}

const requestDelay = Math.round((60 / config.requestsPerMinute) * 1000)

const allowedExtensionLookup = {
    ...config.extensions.image.reduce((acc, ext) => ({ ...acc, [ext]: 'image' }), {}),
    ...config.extensions.video.reduce((acc, ext) => ({ ...acc, [ext]: 'video' }), {})
} as { [key: string]: 'image' | 'video' }

type SchemaRow = {
    TABLE_NAME: string
    COLUMN_NAME: string
}

const fetchImgurLinksFromDatabase = async (schemaRows: SchemaRow[]) => {
    console.log('^5[INFO]^7: Fetching imgur links from database...')

    let count = 0
    let inserted = {} as { [key: string]: boolean }
    let occurances = {} as {
        [key: string]: {
            locations: {
                table: string
                column: string
            }[]
        }
    }

    for (const row of schemaRows) {
        const { TABLE_NAME, COLUMN_NAME } = row
        const tableName = `\`${TABLE_NAME}\``
        const columnName = `\`${COLUMN_NAME}\``

        if (tableName == '`fivemanage_convert_lookup`') continue

        const imageRows = (await MySQL.query(
            `SELECT ${columnName} FROM ${tableName} WHERE ${columnName} LIKE 'https://i.imgur.com/%'`
        )) as { [key: string]: string }[]

        if (imageRows.length == 0) continue

        console.log(imageRows.length, 'images found in', tableName, '->', columnName)
        console.log('Inserting images into fivemanage_convert_lookup, this may take a while...')

        for (const imageRow of imageRows) {
            const image = imageRow[COLUMN_NAME]

            if (!image) continue
            if (!occurances[image]) occurances[image] = { locations: [] }
            if (occurances[image].locations.find((loc) => loc.table == tableName && loc.column == columnName)) continue

            occurances[image].locations.push({
                table: tableName,
                column: columnName
            })

            if (inserted[image]) continue

            count++
            inserted[image] = true
            await MySQL.insert('INSERT IGNORE INTO fivemanage_convert_lookup (og_link) VALUES (?)', [image])
        }
    }

    for (const [link, { locations }] of Object.entries(occurances)) {
        await MySQL.update('UPDATE fivemanage_convert_lookup SET occurances = ? WHERE og_link = ?', [JSON.stringify(locations), link])
    }

    inserted = {}

    console.log(`^5[INFO]^7: Fetched ${count} imgur links from the database.`)
    SetResourceKvpInt('fetched', 1)
}

const replaceImagesInDatabase = async (link: string, newLink: string, occurances: { table: string; column: string }[]) => {
    for (const occurance of occurances) {
        const { table, column } = occurance

        if (table != '`fivemanage_convert_lookup`')
            await MySQL.update(`UPDATE ${table} SET ${column} = REPLACE(${column}, ?, ?)`, [link, newLink])
    }
}

MySQL.ready(async () => {
    const dbName = (await MySQL.scalar('SELECT DATABASE()')) as string | undefined

    if (!dbName) {
        return console.log('^1[ERROR]^7: Failed to get current database')
    }

    console.log('Using database: ', dbName)

    const hasFetched = GetResourceKvpInt('fetched') == 1
    const schemaRows = (await MySQL.query('SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ?', [
        dbName
    ])) as { TABLE_NAME: string; COLUMN_NAME: string }[]

    if (!hasFetched) {
        await fetchImgurLinksFromDatabase(schemaRows)
    }

    const totalCount = (await MySQL.scalar('SELECT COUNT(1) FROM fivemanage_convert_lookup')) as number
    const countNotConverted = (await MySQL.scalar('SELECT COUNT(1) FROM fivemanage_convert_lookup WHERE new_link IS NULL')) as number

    console.log(`^5[INFO]^7: Total unique imgur links in database: ${totalCount}`)
    console.log(`^5[INFO]^7: Imgur links left to convert: ${countNotConverted}`)

    if (countNotConverted == 0) {
        return console.log('^5[INFO]^7: All imgur links have been converted.')
    }

    const limit = 50 // fetch 50 images from the database at a time
    let offset = 0
    let failedUploads = 0

    while (true) {
        const rows = (await MySQL.query('SELECT og_link, occurances FROM fivemanage_convert_lookup WHERE new_link IS NULL LIMIT ?, ?', [
            offset,
            limit
        ])) as { og_link: string; occurances?: string }[]

        for (const row of rows) {
            const link = row.og_link
            const occurances = row.occurances ? JSON.parse(row.occurances) : ([] as { table: string; column: string }[])
            const fullName = link.split('/').pop() as string
            const fileName = fullName.split('.').shift() as string
            const extension = fullName.split('.').pop() as string

            if (fileName.length != 7) {
                console.log(`^3[WARNING]^7: Invalid link ${link}, skipping...`)
                continue
            }

            const fileType = allowedExtensionLookup[extension]

            if (!fileType) {
                console.log(`^3[WARNING]^7: Unallowed extension ${extension} for ${link}, skipping...`)
                continue
            }

            const res = await fetch(link, {
                method: 'GET',
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
                }
            })

            if (!res.ok) {
                console.log(`^1[ERROR]^7: Failed to download ${link}, status: ${res.status}.`)

                if (res.status == 429) {
                    console.log(`^3[WARNING]^7: Rate limited, waiting 60 seconds...`)
                    await delay(60000)
                } else {
                    failedUploads += 1
                }

                continue
            }

            try {
                const buffer = await res.arrayBuffer()
                const formData = new FormData()
                const file = new File([Buffer.from(buffer)], `${fileName}.${extension}`, { type: res.headers.get('content-type') })

                formData.append(fileType, file)
                formData.append(
                    'metadata',
                    JSON.stringify({
                        imgur: link,
                        message: 'Converted to Fivemanage from Imgur'
                    })
                )

                const uploadRes = await fetch(`https://api.fivemanage.com/api/${fileType}`, {
                    method: 'POST',
                    headers: {
                        Authorization: fileType == 'video' ? config.videoToken : config.photoToken
                    },
                    body: formData
                })

                if (!uploadRes.ok || uploadRes.status != 200) throw new Error('Failed to upload image, status: ' + uploadRes.status)

                const newLink = ((await uploadRes.json()) as { url: string }).url

                if (!newLink) throw new Error('Failed to upload image (no url from Fivemanage)')

                await MySQL.update('UPDATE fivemanage_convert_lookup SET new_link = ? WHERE og_link = ?', [newLink, link])
                await replaceImagesInDatabase(link, newLink, occurances)

                console.log(`^5[INFO]^7: Replaced ${link} with ${newLink}`)
            } catch (e) {
                console.log(`^1[ERROR]^7: Failed to upload ${link}, error:`, e)

                failedUploads += 1
            }

            await delay(requestDelay)
        }

        offset += limit

        break
    }

    if (failedUploads == 0) {
        console.log(`^5[INFO]^7: All imgur links have been converted.`)
        return
    }

    console.log(`^1[ERROR]^7: Failed to upload ${failedUploads} imgur links, try restarting the script in a while.`)
})
