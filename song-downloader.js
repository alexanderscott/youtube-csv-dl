/**
 * Usage:
 * node song-downloader.js song-list.csv
 */

const cp = require('child_process'),
  async = require('async'),
  request = require('request'),
  _und = require('underscore'),
  fs = require('fs'),
  querystring = require("querystring"),
  path = require('path'),
  os = require('os'),
  csvParser = require('csv-parse');

const inputFile = process.argv[2];

const outputDir = path.resolve(__dirname, path.basename(inputFile, ".csv")) + "/";
const configFilePath = path.resolve(require('os').homedir(), ".config/youtube-csv-dl/config.json");
const ytSearchBaseUrl = 'https://www.googleapis.com/youtube/v3/search';

let audioFormat = "mp3";
let youtubeApiKey = process.env["YOUTUBE_API_KEY"];
let audioQuality = 0;


function logErrorAndExit(err) {
  console.error(err);
  process.exit(1);
}

if (!inputFile) {
  logErrorAndExit("No input file specified!");
}

if (fs.existsSync(configFilePath)) {
  try {
    const config = require(configFilePath);
    audioFormat = config.AUDIO_FORMAT || audioFormat;
    youtubeApiKey = config.YOUTUBE_API_KEY || youtubeApiKey;
    audioQuality = config.AUDIO_QUALITY || audioQuality;
  } catch (err) {
    logErrorAndExit(err);
  }
}

if (!youtubeApiKey) logErrorAndExit("No YouTube API key configured!  Add to $HOME/.config/youtube-csv-dl/config.json or export to your ENV");

try {
  console.log("Creating output directory ", outputDir);
  fs.mkdirSync(outputDir);
} catch (err) {
  console.error("Error creating output directory. It  might already exist?  Continuing...");
}

console.log("Downloading files to ", outputDir);

function downloadYoutubeVid(youtubeUrl, cb) {
  cp.exec("/usr/local/bin/youtube-dl " +
          "-x " +  // download audio only
          "--no-mtime " +  // do not apply the original date modified
          "--audio-quality " + audioQuality + " " + // best audio quality
          "--add-metadata " +  // add metadata to file
          "--metadata-from-title '%(artist)s - %(title)s' " + 
          //"--restrict-filenames " +   // replace spaces & special chars
          "--prefer-ffmpeg " +  // fixes embedding of images
          "--audio-format " + audioFormat + " " + 
          "--embed-thumbnail " +  // embed image into file
          "-o '" + outputDir + "%(title)s.%(ext)s' " +  // output to a dir named after the csv file
          youtubeUrl, (err, stdout, stderr) => {

    if (err) {
      console.error("Error downloading YouTube audio", err);
      return cb(null);
    }

    console.log(stdout);
    cb(null);
  });
}

function searchYoutubeVid(query, cb) {
  request({
    method: 'GET',
    uri: ytSearchBaseUrl + 
        '?part=snippet&type=video&key=' + 
        youtubeApiKey + '&' + 
        querystring.stringify({ q: query }), 
    json: true
  }, (err, response, body) => {
    if (err) {
      console.error(err);
      return cb(err);
    }

    if (_und.isEmpty(body.items)) {
      return cb("Could not find youtube videos matching ", query);
    }

    let firstVidId = body.items[0].id.videoId;
    let vidUrl = "https://www.youtube.com/watch?v=" + firstVidId;
    cb(null, vidUrl);
  });
}

function parseCsvFile(filePath, cb) {
  fs.readFile(filePath, (err, contents) => {
    if (err) {
      console.error("Error reading file at path", filePath);
      return cb(err);
    }
    csvParser(contents, { delimiter: ';' }, (err, csvArr) => {
      if (err) {
        console.error("Error parsing csv", err);
        return cb(err);
      }

      cb(null, csvArr);
    });
  });
}

parseCsvFile(inputFile, (err, csvArr) => {
  async.eachSeries(csvArr, (songArtistArr, cb) => {
    let query = songArtistArr[0];
    if (_und.size(songArtistArr) > 1) {
      query = songArtistArr[0] + " " + songArtistArr[1];
    }
    searchYoutubeVid(query, (err, vidUrl) => {
      downloadYoutubeVid(vidUrl, cb);
    });
  });
});

