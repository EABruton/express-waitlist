import path from "path";
import { glob } from "glob";
import MiniCssExtractPlugin from "mini-css-extract-plugin";

const __dirname = path.resolve();

export default {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  // Dynamically bundle all entry points in src
  entry: () => {
    const entries = {};
    const jsFiles = glob.sync("./src/js/**/*.js");
    for (const file of jsFiles) {
      // strip off the root filepath and ext when determining the name
      const name = file.replace("src/", "").replace(/\.js$/, "");
      entries[name] = "./" + file;
    }

    const cssFiles = glob.sync("./src/css/**/*.css");
    for (const file of cssFiles) {
      const name = file.replace("src/", "").replace(/\.css$/, "");
      entries[name] = "./" + file;
    }

    return entries;
  },
  output: {
    path: path.resolve(__dirname, "public/dist"),
    filename: "[name].js",
    publicPath: "/dist/", // public URL used by Express for static serving
    clean: true, // remove old bundles on rebuild
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        include: path.resolve(__dirname, "src/js"),
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"], // transpile modern JS
          },
        },
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].css",
    }),
  ],
  resolve: {
    extensions: [".js", ".json"],
  },
  devtool: process.env.NODE_ENV === "production" ? false : "source-map",
};
