# HTML page example

This is a project that aims to build a simple set of scripts that can be included in a HTML page to show JSCAD models. It is work in progress, but will likely improve based on user feedback.

# bundle your scripts
To bundle your scripts you can use this `esbuild ` command:

```sh
esbuild .\script.js --bundle --external:@jscad/modeling --outdir=build  
--sourcemap=inline --format=cjs --watch
```

This way `@jscad/modeling` will not be included in the bundle, and that is ok because worker has it available unlike other dependencies that you might have. You can drag and drop the generated script on http://openjscad.xyz and develop it even further before including with your HTML page.

`--sourcemap=inline` option is gives line numbers when errors occur, it is nice while developing, but can be omitted for production build.

