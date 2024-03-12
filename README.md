# Convert images to Fivemanage from Imgur

## ⚠️ IMPORTANT!! ⚠️

Make a backup of your database before running this script, in case anything goes wrong.

## Installation & usage

1. Download the script (clone it and remove -master from the name)
2. Add the script to your server.cfg
3. Set your Fivemanage tokens in the config.json file
4. Run the `lookup.sql` file in your database
5. Type `ensure imgur-to-fivemanage` in your server console (txAdmin)

## Notes

-   This script may not work as expected, e.g. some images may fail to upload
-   You may get timed out from Imgur/Fivemanage, blocking you from converting images. If that happens, stop the script and restart it in 15 minutes or so.
-   I recommend using a proxy/vpn to avoid getting your ip blacklisted
-   It should be fine to run on a server with players
-   After it has finished running, you can restart the script to ensure that it didn't miss any images.
