<?php
/*
 * PRIVATE CONFIGURATION TEMPLATE.
 * Copy this file to config.php in the same folder, then fill in the values from cPanel
 * (see DEPLOY.md, steps 2 and 5). Never upload real passwords inside public_html.
 */
return [
    'app_name'       => 'Jaguar Task Scheduler',
    'base_url'       => 'https://nahuatl.greenpointengineering.ca/azteca/jaguar',  // live address, https
    'allow_signup'   => true,   // true: anyone can create a company account. Set false to close sign-up.
    'secure_cookies' => true,   // true: session cookie only over HTTPS. Keep true on HostPapa with SSL.

    'db' => [
        'host' => 'localhost',           // HostPapa normally uses localhost; check MySQL Databases page
        'name' => 'cpaneluser_jaguar',   // full database name, including the cPanel prefix
        'user' => 'cpaneluser_jaguar',   // full database user name, including the prefix
        'pass' => 'CHANGE_ME_STRONG_PASSWORD',
    ],
];
