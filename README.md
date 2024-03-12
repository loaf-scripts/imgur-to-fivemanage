# Convert images to Fivemanage from Imgur

## Installation

1. Download the script (clone it, or download from releases)
2. Add the script to your server.cfg
3. Set your Fivemanage tokens in the config.json file
4. Run the `lookup.sql` file in your database
5. Type `ensure imgur-to-fivemanage` in your server console (txAdmin)

## Notes

-   This script may not work as expected, some images may not be converted
-   You may get timed out from Imgur/Fivemanage, blocking you from converting images. If that happens, stop the script and restart it in 15 minutes or so.
-   I recommend using a proxy/vpn to avoid getting your ip blacklisted
-   It should be fine to run on a server with players
