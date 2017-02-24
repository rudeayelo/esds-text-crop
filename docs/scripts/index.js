'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var r = _interopDefault(require('restructure'));
var _Object$getOwnPropertyDescriptor = _interopDefault(require('babel-runtime/core-js/object/get-own-property-descriptor'));
var _getIterator = _interopDefault(require('babel-runtime/core-js/get-iterator'));
var _Object$freeze = _interopDefault(require('babel-runtime/core-js/object/freeze'));
var _Object$keys = _interopDefault(require('babel-runtime/core-js/object/keys'));
var _typeof = _interopDefault(require('babel-runtime/helpers/typeof'));
var _Object$defineProperty = _interopDefault(require('babel-runtime/core-js/object/define-property'));
var _classCallCheck = _interopDefault(require('babel-runtime/helpers/classCallCheck'));
var _createClass = _interopDefault(require('babel-runtime/helpers/createClass'));
var _Map = _interopDefault(require('babel-runtime/core-js/map'));
var _Object$getPrototypeOf = _interopDefault(require('babel-runtime/core-js/object/get-prototype-of'));
var _possibleConstructorReturn = _interopDefault(require('babel-runtime/helpers/possibleConstructorReturn'));
var _inherits = _interopDefault(require('babel-runtime/helpers/inherits'));
var restructure_src_utils = require('restructure/src/utils');
var _Object$defineProperties = _interopDefault(require('babel-runtime/core-js/object/define-properties'));
var isEqual = _interopDefault(require('deep-equal'));
var _get = _interopDefault(require('babel-runtime/helpers/get'));
var _Object$assign = _interopDefault(require('babel-runtime/core-js/object/assign'));
var _toConsumableArray = _interopDefault(require('babel-runtime/helpers/toConsumableArray'));
var _String$fromCodePoint = _interopDefault(require('babel-runtime/core-js/string/from-code-point'));
var _slicedToArray = _interopDefault(require('babel-runtime/helpers/slicedToArray'));
var _Array$from = _interopDefault(require('babel-runtime/core-js/array/from'));
var _Set = _interopDefault(require('babel-runtime/core-js/set'));
var unicode = _interopDefault(require('unicode-properties'));
var UnicodeTrie = _interopDefault(require('unicode-trie'));
var StateMachine = _interopDefault(require('dfa'));
var cloneDeep = _interopDefault(require('clone'));
var inflate = _interopDefault(require('tiny-inflate'));
var brotli = _interopDefault(require('brotli/decompress'));

var fs = require('fs');

var fontkit = {};
fontkit.logErrors = false;

var formats = [];
fontkit.registerFormat = function (format) {
  formats.push(format);
};

fontkit.openSync = function (filename, postscriptName) {
  var buffer = fs.readFileSync(filename);
  return fontkit.create(buffer, postscriptName);
};

fontkit.open = function (filename, postscriptName, callback) {
  if (typeof postscriptName === 'function') {
    callback = postscriptName;
    postscriptName = null;
  }

  fs.readFile(filename, function (err, buffer) {
    if (err) {
      return callback(err);
    }

    try {
      var font = fontkit.create(buffer, postscriptName);
    } catch (e) {
      return callback(e);
    }

    return callback(null, font);
  });

  return;
};

fontkit.create = function (buffer, postscriptName) {
  for (var i = 0; i < formats.length; i++) {
    var format = formats[i];
    if (format.probe(buffer)) {
      var font = new format(new r.DecodeStream(buffer));
      if (postscriptName) {
        return font.getFont(postscriptName);
      }

      return font;
    }
  }

  throw new Error('Unknown font format');
};

/**
 * This decorator caches the results of a getter or method such that
 * the results are lazily computed once, and then cached.
 * @private
 */
function cache(target, key, descriptor) {
  if (descriptor.get) {
    (function () {
      var get = descriptor.get;
      descriptor.get = function () {
        var value = get.call(this);
        _Object$defineProperty(this, key, { value: value });
        return value;
      };
    })();
  } else if (typeof descriptor.value === 'function') {
    var _ret2 = function () {
      var fn = descriptor.value;

      return {
        v: {
          get: function get() {
            var cache = new _Map();
            function memoized() {
              for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
                args[_key] = arguments[_key];
              }

              var key = args.length > 0 ? args[0] : 'value';
              if (cache.has(key)) {
                return cache.get(key);
              }

              var result = fn.apply(this, args);
              cache.set(key, result);
              return result;
            };

            _Object$defineProperty(this, key, { value: memoized });
            return memoized;
          }
        }
      };
    }();

    if ((typeof _ret2 === 'undefined' ? 'undefined' : _typeof(_ret2)) === "object") return _ret2.v;
  }
}

var SubHeader = new r.Struct({
  firstCode: r.uint16,
  entryCount: r.uint16,
  idDelta: r.int16,
  idRangeOffset: r.uint16
});

var CmapGroup = new r.Struct({
  startCharCode: r.uint32,
  endCharCode: r.uint32,
  glyphID: r.uint32
});

var UnicodeValueRange = new r.Struct({
  startUnicodeValue: r.uint24,
  additionalCount: r.uint8
});

var UVSMapping = new r.Struct({
  unicodeValue: r.uint24,
  glyphID: r.uint16
});

var DefaultUVS = new r.Array(UnicodeValueRange, r.uint32);
var NonDefaultUVS = new r.Array(UVSMapping, r.uint32);

var VarSelectorRecord = new r.Struct({
  varSelector: r.uint24,
  defaultUVS: new r.Pointer(r.uint32, DefaultUVS, { type: 'parent' }),
  nonDefaultUVS: new r.Pointer(r.uint32, NonDefaultUVS, { type: 'parent' })
});

var CmapSubtable = new r.VersionedStruct(r.uint16, {
  0: { // Byte encoding
    length: r.uint16, // Total table length in bytes (set to 262 for format 0)
    language: r.uint16, // Language code for this encoding subtable, or zero if language-independent
    codeMap: new r.LazyArray(r.uint8, 256)
  },

  2: { // High-byte mapping (CJK)
    length: r.uint16,
    language: r.uint16,
    subHeaderKeys: new r.Array(r.uint16, 256),
    subHeaderCount: function subHeaderCount(t) {
      return Math.max.apply(Math, t.subHeaderKeys);
    },
    subHeaders: new r.LazyArray(SubHeader, 'subHeaderCount'),
    glyphIndexArray: new r.LazyArray(r.uint16, 'subHeaderCount')
  },

  4: { // Segment mapping to delta values
    length: r.uint16, // Total table length in bytes
    language: r.uint16, // Language code
    segCountX2: r.uint16,
    segCount: function segCount(t) {
      return t.segCountX2 >> 1;
    },
    searchRange: r.uint16,
    entrySelector: r.uint16,
    rangeShift: r.uint16,
    endCode: new r.LazyArray(r.uint16, 'segCount'),
    reservedPad: new r.Reserved(r.uint16), // This value should be zero
    startCode: new r.LazyArray(r.uint16, 'segCount'),
    idDelta: new r.LazyArray(r.int16, 'segCount'),
    idRangeOffset: new r.LazyArray(r.uint16, 'segCount'),
    glyphIndexArray: new r.LazyArray(r.uint16, function (t) {
      return (t.length - t._currentOffset) / 2;
    })
  },

  6: { // Trimmed table
    length: r.uint16,
    language: r.uint16,
    firstCode: r.uint16,
    entryCount: r.uint16,
    glyphIndices: new r.LazyArray(r.uint16, 'entryCount')
  },

  8: { // mixed 16-bit and 32-bit coverage
    reserved: new r.Reserved(r.uint16),
    length: r.uint32,
    language: r.uint16,
    is32: new r.LazyArray(r.uint8, 8192),
    nGroups: r.uint32,
    groups: new r.LazyArray(CmapGroup, 'nGroups')
  },

  10: { // Trimmed Array
    reserved: new r.Reserved(r.uint16),
    length: r.uint32,
    language: r.uint32,
    firstCode: r.uint32,
    entryCount: r.uint32,
    glyphIndices: new r.LazyArray(r.uint16, 'numChars')
  },

  12: { // Segmented coverage
    reserved: new r.Reserved(r.uint16),
    length: r.uint32,
    language: r.uint32,
    nGroups: r.uint32,
    groups: new r.LazyArray(CmapGroup, 'nGroups')
  },

  13: { // Many-to-one range mappings (same as 12 except for group.startGlyphID)
    reserved: new r.Reserved(r.uint16),
    length: r.uint32,
    language: r.uint32,
    nGroups: r.uint32,
    groups: new r.LazyArray(CmapGroup, 'nGroups')
  },

  14: { // Unicode Variation Sequences
    length: r.uint32,
    numRecords: r.uint32,
    varSelectors: new r.LazyArray(VarSelectorRecord, 'numRecords')
  }
});

var CmapEntry = new r.Struct({
  platformID: r.uint16, // Platform identifier
  encodingID: r.uint16, // Platform-specific encoding identifier
  table: new r.Pointer(r.uint32, CmapSubtable, { type: 'parent', lazy: true })
});

// character to glyph mapping
var cmap = new r.Struct({
  version: r.uint16,
  numSubtables: r.uint16,
  tables: new r.Array(CmapEntry, 'numSubtables')
});

// font header
var head = new r.Struct({
  version: r.int32, // 0x00010000 (version 1.0)
  revision: r.int32, // set by font manufacturer
  checkSumAdjustment: r.uint32,
  magicNumber: r.uint32, // set to 0x5F0F3CF5
  flags: r.uint16,
  unitsPerEm: r.uint16, // range from 64 to 16384
  created: new r.Array(r.int32, 2),
  modified: new r.Array(r.int32, 2),
  xMin: r.int16, // for all glyph bounding boxes
  yMin: r.int16, // for all glyph bounding boxes
  xMax: r.int16, // for all glyph bounding boxes
  yMax: r.int16, // for all glyph bounding boxes
  macStyle: new r.Bitfield(r.uint16, ['bold', 'italic', 'underline', 'outline', 'shadow', 'condensed', 'extended']),
  lowestRecPPEM: r.uint16, // smallest readable size in pixels
  fontDirectionHint: r.int16,
  indexToLocFormat: r.int16, // 0 for short offsets, 1 for long
  glyphDataFormat: r.int16 // 0 for current format
});

// horizontal header
var hhea = new r.Struct({
  version: r.int32,
  ascent: r.int16, // Distance from baseline of highest ascender
  descent: r.int16, // Distance from baseline of lowest descender
  lineGap: r.int16, // Typographic line gap
  advanceWidthMax: r.uint16, // Maximum advance width value in 'hmtx' table
  minLeftSideBearing: r.int16, // Maximum advance width value in 'hmtx' table
  minRightSideBearing: r.int16, // Minimum right sidebearing value
  xMaxExtent: r.int16,
  caretSlopeRise: r.int16, // Used to calculate the slope of the cursor (rise/run); 1 for vertical
  caretSlopeRun: r.int16, // 0 for vertical
  caretOffset: r.int16, // Set to 0 for non-slanted fonts
  reserved: new r.Reserved(r.int16, 4),
  metricDataFormat: r.int16, // 0 for current format
  numberOfMetrics: r.uint16 // Number of advance widths in 'hmtx' table
});

var HmtxEntry = new r.Struct({
  advance: r.uint16,
  bearing: r.int16
});

var hmtx = new r.Struct({
  metrics: new r.LazyArray(HmtxEntry, function (t) {
    return t.parent.hhea.numberOfMetrics;
  }),
  bearings: new r.LazyArray(r.int16, function (t) {
    return t.parent.maxp.numGlyphs - t.parent.hhea.numberOfMetrics;
  })
});

// maxiumum profile
var maxp = new r.Struct({
  version: r.int32,
  numGlyphs: r.uint16, // The number of glyphs in the font
  maxPoints: r.uint16, // Maximum points in a non-composite glyph
  maxContours: r.uint16, // Maximum contours in a non-composite glyph
  maxComponentPoints: r.uint16, // Maximum points in a composite glyph
  maxComponentContours: r.uint16, // Maximum contours in a composite glyph
  maxZones: r.uint16, // 1 if instructions do not use the twilight zone, 2 otherwise
  maxTwilightPoints: r.uint16, // Maximum points used in Z0
  maxStorage: r.uint16, // Number of Storage Area locations
  maxFunctionDefs: r.uint16, // Number of FDEFs
  maxInstructionDefs: r.uint16, // Number of IDEFs
  maxStackElements: r.uint16, // Maximum stack depth
  maxSizeOfInstructions: r.uint16, // Maximum byte count for glyph instructions
  maxComponentElements: r.uint16, // Maximum number of components referenced at “top level” for any composite glyph
  maxComponentDepth: r.uint16 // Maximum levels of recursion; 1 for simple components
});

/**
 * Gets an encoding name from platform, encoding, and language ids.
 * Returned encoding names can be used in iconv-lite to decode text.
 */
function getEncoding(platformID, encodingID) {
  var languageID = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

  if (platformID === 1 && MAC_LANGUAGE_ENCODINGS[languageID]) {
    return MAC_LANGUAGE_ENCODINGS[languageID];
  }

  return ENCODINGS[platformID][encodingID];
}

// Map of platform ids to encoding ids.
var ENCODINGS = [
// unicode
['utf16be', 'utf16be', 'utf16be', 'utf16be', 'utf16be', 'utf16be'],

// macintosh
// Mappings available at http://unicode.org/Public/MAPPINGS/VENDORS/APPLE/
// 0	Roman                 17	Malayalam
// 1	Japanese	            18	Sinhalese
// 2	Traditional Chinese	  19	Burmese
// 3	Korean	              20	Khmer
// 4	Arabic	              21	Thai
// 5	Hebrew	              22	Laotian
// 6	Greek	                23	Georgian
// 7	Russian	              24	Armenian
// 8	RSymbol	              25	Simplified Chinese
// 9	Devanagari	          26	Tibetan
// 10	Gurmukhi	            27	Mongolian
// 11	Gujarati	            28	Geez
// 12	Oriya	                29	Slavic
// 13	Bengali	              30	Vietnamese
// 14	Tamil	                31	Sindhi
// 15	Telugu	              32	(Uninterpreted)
// 16	Kannada
['macroman', 'shift-jis', 'big5', 'euc-kr', 'iso-8859-6', 'iso-8859-8', 'macgreek', 'maccyrillic', 'symbol', 'Devanagari', 'Gurmukhi', 'Gujarati', 'Oriya', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Sinhalese', 'Burmese', 'Khmer', 'macthai', 'Laotian', 'Georgian', 'Armenian', 'gb-2312-80', 'Tibetan', 'Mongolian', 'Geez', 'maccenteuro', 'Vietnamese', 'Sindhi'],

// ISO (deprecated)
['ascii'],

// windows
// Docs here: http://msdn.microsoft.com/en-us/library/system.text.encoding(v=vs.110).aspx
['symbol', 'utf16be', 'shift-jis', 'gb18030', 'big5', 'wansung', 'johab', null, null, null, 'utf16be']];

// Overrides for Mac scripts by language id.
// See http://unicode.org/Public/MAPPINGS/VENDORS/APPLE/Readme.txt
var MAC_LANGUAGE_ENCODINGS = {
  15: 'maciceland',
  17: 'macturkish',
  18: 'maccroatian',
  24: 'maccenteuro',
  25: 'maccenteuro',
  26: 'maccenteuro',
  27: 'maccenteuro',
  28: 'maccenteuro',
  30: 'maciceland',
  37: 'macromania',
  38: 'maccenteuro',
  39: 'maccenteuro',
  40: 'maccenteuro',
  143: 'macinuit', // Unsupported by iconv-lite
  146: 'macgaelic' // Unsupported by iconv-lite
};

// Map of platform ids to BCP-47 language codes.
var LANGUAGES = [
// unicode
[], { // macintosh
  0: 'en', 30: 'fo', 60: 'ks', 90: 'rw',
  1: 'fr', 31: 'fa', 61: 'ku', 91: 'rn',
  2: 'de', 32: 'ru', 62: 'sd', 92: 'ny',
  3: 'it', 33: 'zh', 63: 'bo', 93: 'mg',
  4: 'nl', 34: 'nl-BE', 64: 'ne', 94: 'eo',
  5: 'sv', 35: 'ga', 65: 'sa', 128: 'cy',
  6: 'es', 36: 'sq', 66: 'mr', 129: 'eu',
  7: 'da', 37: 'ro', 67: 'bn', 130: 'ca',
  8: 'pt', 38: 'cz', 68: 'as', 131: 'la',
  9: 'no', 39: 'sk', 69: 'gu', 132: 'qu',
  10: 'he', 40: 'si', 70: 'pa', 133: 'gn',
  11: 'ja', 41: 'yi', 71: 'or', 134: 'ay',
  12: 'ar', 42: 'sr', 72: 'ml', 135: 'tt',
  13: 'fi', 43: 'mk', 73: 'kn', 136: 'ug',
  14: 'el', 44: 'bg', 74: 'ta', 137: 'dz',
  15: 'is', 45: 'uk', 75: 'te', 138: 'jv',
  16: 'mt', 46: 'be', 76: 'si', 139: 'su',
  17: 'tr', 47: 'uz', 77: 'my', 140: 'gl',
  18: 'hr', 48: 'kk', 78: 'km', 141: 'af',
  19: 'zh-Hant', 49: 'az-Cyrl', 79: 'lo', 142: 'br',
  20: 'ur', 50: 'az-Arab', 80: 'vi', 143: 'iu',
  21: 'hi', 51: 'hy', 81: 'id', 144: 'gd',
  22: 'th', 52: 'ka', 82: 'tl', 145: 'gv',
  23: 'ko', 53: 'mo', 83: 'ms', 146: 'ga',
  24: 'lt', 54: 'ky', 84: 'ms-Arab', 147: 'to',
  25: 'pl', 55: 'tg', 85: 'am', 148: 'el-polyton',
  26: 'hu', 56: 'tk', 86: 'ti', 149: 'kl',
  27: 'es', 57: 'mn-CN', 87: 'om', 150: 'az',
  28: 'lv', 58: 'mn', 88: 'so', 151: 'nn',
  29: 'se', 59: 'ps', 89: 'sw'
},

// ISO (deprecated)
[], { // windows                                        
  0x0436: 'af', 0x4009: 'en-IN', 0x0487: 'rw', 0x0432: 'tn',
  0x041C: 'sq', 0x1809: 'en-IE', 0x0441: 'sw', 0x045B: 'si',
  0x0484: 'gsw', 0x2009: 'en-JM', 0x0457: 'kok', 0x041B: 'sk',
  0x045E: 'am', 0x4409: 'en-MY', 0x0412: 'ko', 0x0424: 'sl',
  0x1401: 'ar-DZ', 0x1409: 'en-NZ', 0x0440: 'ky', 0x2C0A: 'es-AR',
  0x3C01: 'ar-BH', 0x3409: 'en-PH', 0x0454: 'lo', 0x400A: 'es-BO',
  0x0C01: 'ar', 0x4809: 'en-SG', 0x0426: 'lv', 0x340A: 'es-CL',
  0x0801: 'ar-IQ', 0x1C09: 'en-ZA', 0x0427: 'lt', 0x240A: 'es-CO',
  0x2C01: 'ar-JO', 0x2C09: 'en-TT', 0x082E: 'dsb', 0x140A: 'es-CR',
  0x3401: 'ar-KW', 0x0809: 'en-GB', 0x046E: 'lb', 0x1C0A: 'es-DO',
  0x3001: 'ar-LB', 0x0409: 'en', 0x042F: 'mk', 0x300A: 'es-EC',
  0x1001: 'ar-LY', 0x3009: 'en-ZW', 0x083E: 'ms-BN', 0x440A: 'es-SV',
  0x1801: 'ary', 0x0425: 'et', 0x043E: 'ms', 0x100A: 'es-GT',
  0x2001: 'ar-OM', 0x0438: 'fo', 0x044C: 'ml', 0x480A: 'es-HN',
  0x4001: 'ar-QA', 0x0464: 'fil', 0x043A: 'mt', 0x080A: 'es-MX',
  0x0401: 'ar-SA', 0x040B: 'fi', 0x0481: 'mi', 0x4C0A: 'es-NI',
  0x2801: 'ar-SY', 0x080C: 'fr-BE', 0x047A: 'arn', 0x180A: 'es-PA',
  0x1C01: 'aeb', 0x0C0C: 'fr-CA', 0x044E: 'mr', 0x3C0A: 'es-PY',
  0x3801: 'ar-AE', 0x040C: 'fr', 0x047C: 'moh', 0x280A: 'es-PE',
  0x2401: 'ar-YE', 0x140C: 'fr-LU', 0x0450: 'mn', 0x500A: 'es-PR',
  0x042B: 'hy', 0x180C: 'fr-MC', 0x0850: 'mn-CN', 0x0C0A: 'es',
  0x044D: 'as', 0x100C: 'fr-CH', 0x0461: 'ne', 0x040A: 'es',
  0x082C: 'az-Cyrl', 0x0462: 'fy', 0x0414: 'nb', 0x540A: 'es-US',
  0x042C: 'az', 0x0456: 'gl', 0x0814: 'nn', 0x380A: 'es-UY',
  0x046D: 'ba', 0x0437: 'ka', 0x0482: 'oc', 0x200A: 'es-VE',
  0x042D: 'eu', 0x0C07: 'de-AT', 0x0448: 'or', 0x081D: 'sv-FI',
  0x0423: 'be', 0x0407: 'de', 0x0463: 'ps', 0x041D: 'sv',
  0x0845: 'bn', 0x1407: 'de-LI', 0x0415: 'pl', 0x045A: 'syr',
  0x0445: 'bn-IN', 0x1007: 'de-LU', 0x0416: 'pt', 0x0428: 'tg',
  0x201A: 'bs-Cyrl', 0x0807: 'de-CH', 0x0816: 'pt-PT', 0x085F: 'tzm',
  0x141A: 'bs', 0x0408: 'el', 0x0446: 'pa', 0x0449: 'ta',
  0x047E: 'br', 0x046F: 'kl', 0x046B: 'qu-BO', 0x0444: 'tt',
  0x0402: 'bg', 0x0447: 'gu', 0x086B: 'qu-EC', 0x044A: 'te',
  0x0403: 'ca', 0x0468: 'ha', 0x0C6B: 'qu', 0x041E: 'th',
  0x0C04: 'zh-HK', 0x040D: 'he', 0x0418: 'ro', 0x0451: 'bo',
  0x1404: 'zh-MO', 0x0439: 'hi', 0x0417: 'rm', 0x041F: 'tr',
  0x0804: 'zh', 0x040E: 'hu', 0x0419: 'ru', 0x0442: 'tk',
  0x1004: 'zh-SG', 0x040F: 'is', 0x243B: 'smn', 0x0480: 'ug',
  0x0404: 'zh-TW', 0x0470: 'ig', 0x103B: 'smj-NO', 0x0422: 'uk',
  0x0483: 'co', 0x0421: 'id', 0x143B: 'smj', 0x042E: 'hsb',
  0x041A: 'hr', 0x045D: 'iu', 0x0C3B: 'se-FI', 0x0420: 'ur',
  0x101A: 'hr-BA', 0x085D: 'iu-Latn', 0x043B: 'se', 0x0843: 'uz-Cyrl',
  0x0405: 'cs', 0x083C: 'ga', 0x083B: 'se-SE', 0x0443: 'uz',
  0x0406: 'da', 0x0434: 'xh', 0x203B: 'sms', 0x042A: 'vi',
  0x048C: 'prs', 0x0435: 'zu', 0x183B: 'sma-NO', 0x0452: 'cy',
  0x0465: 'dv', 0x0410: 'it', 0x1C3B: 'sms', 0x0488: 'wo',
  0x0813: 'nl-BE', 0x0810: 'it-CH', 0x044F: 'sa', 0x0485: 'sah',
  0x0413: 'nl', 0x0411: 'ja', 0x1C1A: 'sr-Cyrl-BA', 0x0478: 'ii',
  0x0C09: 'en-AU', 0x044B: 'kn', 0x0C1A: 'sr', 0x046A: 'yo',
  0x2809: 'en-BZ', 0x043F: 'kk', 0x181A: 'sr-Latn-BA',
  0x1009: 'en-CA', 0x0453: 'km', 0x081A: 'sr-Latn',
  0x2409: 'en-029', 0x0486: 'quc', 0x046C: 'nso'
}];

var NameRecord = new r.Struct({
  platformID: r.uint16,
  encodingID: r.uint16,
  languageID: r.uint16,
  nameID: r.uint16,
  length: r.uint16,
  string: new r.Pointer(r.uint16, new r.String('length', function (t) {
    return getEncoding(t.platformID, t.encodingID, t.languageID);
  }), { type: 'parent', relativeTo: 'parent.stringOffset', allowNull: false })
});

var LangTagRecord = new r.Struct({
  length: r.uint16,
  tag: new r.Pointer(r.uint16, new r.String('length', 'utf16be'), { type: 'parent', relativeTo: 'stringOffset' })
});

var NameTable = new r.VersionedStruct(r.uint16, {
  0: {
    count: r.uint16,
    stringOffset: r.uint16,
    records: new r.Array(NameRecord, 'count')
  },
  1: {
    count: r.uint16,
    stringOffset: r.uint16,
    records: new r.Array(NameRecord, 'count'),
    langTagCount: r.uint16,
    langTags: new r.Array(LangTagRecord, 'langTagCount')
  }
});

var NAMES = ['copyright', 'fontFamily', 'fontSubfamily', 'uniqueSubfamily', 'fullName', 'version', 'postscriptName', // Note: A font may have only one PostScript name and that name must be ASCII.
'trademark', 'manufacturer', 'designer', 'description', 'vendorURL', 'designerURL', 'license', 'licenseURL', null, // reserved
'preferredFamily', 'preferredSubfamily', 'compatibleFull', 'sampleText', 'postscriptCIDFontName', 'wwsFamilyName', 'wwsSubfamilyName'];

NameTable.process = function (stream) {
  var records = {};
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = _getIterator(this.records), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var record = _step.value;

      // find out what language this is for
      var language = LANGUAGES[record.platformID][record.languageID];

      if (language == null && this.langTags != null && record.languageID >= 0x8000) {
        language = this.langTags[record.languageID - 0x8000].tag;
      }

      if (language == null) {
        language = record.platformID + '-' + record.languageID;
      }

      // if the nameID is >= 256, it is a font feature record (AAT)
      var key = record.nameID >= 256 ? 'fontFeatures' : NAMES[record.nameID] || record.nameID;
      if (records[key] == null) {
        records[key] = {};
      }

      var obj = records[key];
      if (record.nameID >= 256) {
        obj = obj[record.nameID] || (obj[record.nameID] = {});
      }

      obj[language] = record.string;
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  this.records = records;
};

NameTable.preEncode = function () {
  if (Array.isArray(this.records)) return;
  this.version = 0;

  var records = [];
  for (var key in this.records) {
    var val = this.records[key];
    if (key === 'fontFeatures') continue;

    records.push({
      platformID: 3,
      encodingID: 1,
      languageID: 0x409,
      nameID: NAMES.indexOf(key),
      length: Buffer.byteLength(val.en, 'utf16le'),
      string: val.en
    });

    if (key === 'postscriptName') {
      records.push({
        platformID: 1,
        encodingID: 0,
        languageID: 0,
        nameID: NAMES.indexOf(key),
        length: val.en.length,
        string: val.en
      });
    }
  }

  this.records = records;
  this.count = records.length;
  this.stringOffset = NameTable.size(this, null, false);
};

var OS2 = new r.VersionedStruct(r.uint16, {
  header: {
    xAvgCharWidth: r.int16, // average weighted advance width of lower case letters and space
    usWeightClass: r.uint16, // visual weight of stroke in glyphs
    usWidthClass: r.uint16, // relative change from the normal aspect ratio (width to height ratio)
    fsType: new r.Bitfield(r.uint16, [// Indicates font embedding licensing rights
    null, 'noEmbedding', 'viewOnly', 'editable', null, null, null, null, 'noSubsetting', 'bitmapOnly']),
    ySubscriptXSize: r.int16, // recommended horizontal size in pixels for subscripts
    ySubscriptYSize: r.int16, // recommended vertical size in pixels for subscripts
    ySubscriptXOffset: r.int16, // recommended horizontal offset for subscripts
    ySubscriptYOffset: r.int16, // recommended vertical offset form the baseline for subscripts
    ySuperscriptXSize: r.int16, // recommended horizontal size in pixels for superscripts
    ySuperscriptYSize: r.int16, // recommended vertical size in pixels for superscripts
    ySuperscriptXOffset: r.int16, // recommended horizontal offset for superscripts
    ySuperscriptYOffset: r.int16, // recommended vertical offset from the baseline for superscripts
    yStrikeoutSize: r.int16, // width of the strikeout stroke
    yStrikeoutPosition: r.int16, // position of the strikeout stroke relative to the baseline
    sFamilyClass: r.int16, // classification of font-family design
    panose: new r.Array(r.uint8, 10), // describe the visual characteristics of a given typeface
    ulCharRange: new r.Array(r.uint32, 4),
    vendorID: new r.String(4), // four character identifier for the font vendor
    fsSelection: new r.Bitfield(r.uint16, [// bit field containing information about the font
    'italic', 'underscore', 'negative', 'outlined', 'strikeout', 'bold', 'regular', 'useTypoMetrics', 'wws', 'oblique']),
    usFirstCharIndex: r.uint16, // The minimum Unicode index in this font
    usLastCharIndex: r.uint16 // The maximum Unicode index in this font
  },

  // The Apple version of this table ends here, but the Microsoft one continues on...
  0: {},

  1: {
    typoAscender: r.int16,
    typoDescender: r.int16,
    typoLineGap: r.int16,
    winAscent: r.uint16,
    winDescent: r.uint16,
    codePageRange: new r.Array(r.uint32, 2)
  },

  2: {
    // these should be common with version 1 somehow
    typoAscender: r.int16,
    typoDescender: r.int16,
    typoLineGap: r.int16,
    winAscent: r.uint16,
    winDescent: r.uint16,
    codePageRange: new r.Array(r.uint32, 2),

    xHeight: r.int16,
    capHeight: r.int16,
    defaultChar: r.uint16,
    breakChar: r.uint16,
    maxContent: r.uint16
  },

  5: {
    typoAscender: r.int16,
    typoDescender: r.int16,
    typoLineGap: r.int16,
    winAscent: r.uint16,
    winDescent: r.uint16,
    codePageRange: new r.Array(r.uint32, 2),

    xHeight: r.int16,
    capHeight: r.int16,
    defaultChar: r.uint16,
    breakChar: r.uint16,
    maxContent: r.uint16,

    usLowerOpticalPointSize: r.uint16,
    usUpperOpticalPointSize: r.uint16
  }
});

var versions = OS2.versions;
versions[3] = versions[4] = versions[2];

// PostScript information
var post = new r.VersionedStruct(r.fixed32, {
  header: { // these fields exist at the top of all versions
    italicAngle: r.fixed32, // Italic angle in counter-clockwise degrees from the vertical.
    underlinePosition: r.int16, // Suggested distance of the top of the underline from the baseline
    underlineThickness: r.int16, // Suggested values for the underline thickness
    isFixedPitch: r.uint32, // Whether the font is monospaced
    minMemType42: r.uint32, // Minimum memory usage when a TrueType font is downloaded as a Type 42 font
    maxMemType42: r.uint32, // Maximum memory usage when a TrueType font is downloaded as a Type 42 font
    minMemType1: r.uint32, // Minimum memory usage when a TrueType font is downloaded as a Type 1 font
    maxMemType1: r.uint32 // Maximum memory usage when a TrueType font is downloaded as a Type 1 font
  },

  1: {}, // version 1 has no additional fields

  2: {
    numberOfGlyphs: r.uint16,
    glyphNameIndex: new r.Array(r.uint16, 'numberOfGlyphs'),
    names: new r.Array(new r.String(r.uint8))
  },

  2.5: {
    numberOfGlyphs: r.uint16,
    offsets: new r.Array(r.uint8, 'numberOfGlyphs')
  },

  3: {}, // version 3 has no additional fields

  4: {
    map: new r.Array(r.uint32, function (t) {
      return t.parent.maxp.numGlyphs;
    })
  }
});

// An array of predefined values accessible by instructions
var cvt = new r.Struct({
  controlValues: new r.Array(r.int16)
});

// A list of instructions that are executed once when a font is first used.
// These instructions are known as the font program. The main use of this table
// is for the definition of functions that are used in many different glyph programs.
var fpgm = new r.Struct({
  instructions: new r.Array(r.uint8)
});

var loca = new r.VersionedStruct('head.indexToLocFormat', {
  0: {
    offsets: new r.Array(r.uint16)
  },
  1: {
    offsets: new r.Array(r.uint32)
  }
});

loca.process = function () {
  if (this.version === 0) {
    for (var i = 0; i < this.offsets.length; i++) {
      this.offsets[i] <<= 1;
    }
  }
};

loca.preEncode = function () {
  if (this.version != null) return;

  // assume this.offsets is a sorted array
  this.version = this.offsets[this.offsets.length - 1] > 0xffff ? 1 : 0;

  if (this.version === 0) {
    for (var i = 0; i < this.offsets.length; i++) {
      this.offsets[i] >>>= 1;
    }
  }
};

// Set of instructions executed whenever the point size or font transformation change
var prep = new r.Struct({
  controlValueProgram: new r.Array(r.uint8)
});

// only used for encoding
var glyf = new r.Array(new r.Buffer());

var CFFIndex = function () {
  function CFFIndex(type) {
    _classCallCheck(this, CFFIndex);

    this.type = type;
  }

  _createClass(CFFIndex, [{
    key: "decode",
    value: function decode(stream, parent) {
      var count = stream.readUInt16BE();
      if (count === 0) {
        return [];
      }

      var offSize = stream.readUInt8();
      var offsetType = void 0;
      if (offSize === 1) {
        offsetType = r.uint8;
      } else if (offSize === 2) {
        offsetType = r.uint16;
      } else if (offSize === 3) {
        offsetType = r.uint24;
      } else if (offSize === 4) {
        offsetType = r.uint32;
      } else {
        throw new Error("Bad offset size in CFFIndex: " + offSize + " " + stream.pos);
      }

      var ret = [];
      var startPos = stream.pos + (count + 1) * offSize - 1;

      var start = offsetType.decode(stream);
      for (var i = 0; i < count; i++) {
        var end = offsetType.decode(stream);

        if (this.type != null) {
          var pos = stream.pos;
          stream.pos = startPos + start;

          parent.length = end - start;
          ret.push(this.type.decode(stream, parent));
          stream.pos = pos;
        } else {
          ret.push({
            offset: startPos + start,
            length: end - start
          });
        }

        start = end;
      }

      stream.pos = startPos + start;
      return ret;
    }
  }, {
    key: "size",
    value: function size(arr, parent) {
      var size = 2;
      if (arr.length === 0) {
        return size;
      }

      var type = this.type || new r.Buffer();

      // find maximum offset to detminine offset type
      var offset = 1;
      for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        offset += type.size(item, parent);
      }

      var offsetType = void 0;
      if (offset <= 0xff) {
        offsetType = r.uint8;
      } else if (offset <= 0xffff) {
        offsetType = r.uint16;
      } else if (offset <= 0xffffff) {
        offsetType = r.uint24;
      } else if (offset <= 0xffffffff) {
        offsetType = r.uint32;
      } else {
        throw new Error("Bad offset in CFFIndex");
      }

      size += 1 + offsetType.size() * (arr.length + 1);
      size += offset - 1;

      return size;
    }
  }, {
    key: "encode",
    value: function encode(stream, arr, parent) {
      stream.writeUInt16BE(arr.length);
      if (arr.length === 0) {
        return;
      }

      var type = this.type || new r.Buffer();

      // find maximum offset to detminine offset type
      var sizes = [];
      var offset = 1;
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(arr), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var item = _step.value;

          var s = type.size(item, parent);
          sizes.push(s);
          offset += s;
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      var offsetType = void 0;
      if (offset <= 0xff) {
        offsetType = r.uint8;
      } else if (offset <= 0xffff) {
        offsetType = r.uint16;
      } else if (offset <= 0xffffff) {
        offsetType = r.uint24;
      } else if (offset <= 0xffffffff) {
        offsetType = r.uint32;
      } else {
        throw new Error("Bad offset in CFFIndex");
      }

      // write offset size
      stream.writeUInt8(offsetType.size());

      // write elements
      offset = 1;
      offsetType.encode(stream, offset);

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(sizes), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var size = _step2.value;

          offset += size;
          offsetType.encode(stream, offset);
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = _getIterator(arr), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var _item = _step3.value;

          type.encode(stream, _item, parent);
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3.return) {
            _iterator3.return();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }

      return;
    }
  }]);

  return CFFIndex;
}();

var FLOAT_EOF = 0xf;
var FLOAT_LOOKUP = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', 'E', 'E-', null, '-'];

var FLOAT_ENCODE_LOOKUP = {
  '.': 10,
  'E': 11,
  'E-': 12,
  '-': 14
};

var CFFOperand = function () {
  function CFFOperand() {
    _classCallCheck(this, CFFOperand);
  }

  _createClass(CFFOperand, null, [{
    key: 'decode',
    value: function decode(stream, value) {
      if (32 <= value && value <= 246) {
        return value - 139;
      }

      if (247 <= value && value <= 250) {
        return (value - 247) * 256 + stream.readUInt8() + 108;
      }

      if (251 <= value && value <= 254) {
        return -(value - 251) * 256 - stream.readUInt8() - 108;
      }

      if (value === 28) {
        return stream.readInt16BE();
      }

      if (value === 29) {
        return stream.readInt32BE();
      }

      if (value === 30) {
        var str = '';
        while (true) {
          var b = stream.readUInt8();

          var n1 = b >> 4;
          if (n1 === FLOAT_EOF) {
            break;
          }
          str += FLOAT_LOOKUP[n1];

          var n2 = b & 15;
          if (n2 === FLOAT_EOF) {
            break;
          }
          str += FLOAT_LOOKUP[n2];
        }

        return parseFloat(str);
      }

      return null;
    }
  }, {
    key: 'size',
    value: function size(value) {
      // if the value needs to be forced to the largest size (32 bit)
      // e.g. for unknown pointers, set to 32768
      if (value.forceLarge) {
        value = 32768;
      }

      if ((value | 0) !== value) {
        // floating point
        var str = '' + value;
        return 1 + Math.ceil((str.length + 1) / 2);
      } else if (-107 <= value && value <= 107) {
        return 1;
      } else if (108 <= value && value <= 1131 || -1131 <= value && value <= -108) {
        return 2;
      } else if (-32768 <= value && value <= 32767) {
        return 3;
      } else {
        return 5;
      }
    }
  }, {
    key: 'encode',
    value: function encode(stream, value) {
      // if the value needs to be forced to the largest size (32 bit)
      // e.g. for unknown pointers, save the old value and set to 32768
      var val = Number(value);

      if (value.forceLarge) {
        stream.writeUInt8(29);
        return stream.writeInt32BE(val);
      } else if ((val | 0) !== val) {
        // floating point
        stream.writeUInt8(30);

        var str = '' + val;
        for (var i = 0; i < str.length; i += 2) {
          var c1 = str[i];
          var n1 = FLOAT_ENCODE_LOOKUP[c1] || +c1;

          if (i === str.length - 1) {
            var n2 = FLOAT_EOF;
          } else {
            var c2 = str[i + 1];
            var n2 = FLOAT_ENCODE_LOOKUP[c2] || +c2;
          }

          stream.writeUInt8(n1 << 4 | n2 & 15);
        }

        if (n2 !== FLOAT_EOF) {
          return stream.writeUInt8(FLOAT_EOF << 4);
        }
      } else if (-107 <= val && val <= 107) {
        return stream.writeUInt8(val + 139);
      } else if (108 <= val && val <= 1131) {
        val -= 108;
        stream.writeUInt8((val >> 8) + 247);
        return stream.writeUInt8(val & 0xff);
      } else if (-1131 <= val && val <= -108) {
        val = -val - 108;
        stream.writeUInt8((val >> 8) + 251);
        return stream.writeUInt8(val & 0xff);
      } else if (-32768 <= val && val <= 32767) {
        stream.writeUInt8(28);
        return stream.writeInt16BE(val);
      } else {
        stream.writeUInt8(29);
        return stream.writeInt32BE(val);
      }
    }
  }]);

  return CFFOperand;
}();

var CFFDict = function () {
  function CFFDict() {
    var ops = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];

    _classCallCheck(this, CFFDict);

    this.ops = ops;
    this.fields = {};
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = _getIterator(ops), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var field = _step.value;

        var key = Array.isArray(field[0]) ? field[0][0] << 8 | field[0][1] : field[0];
        this.fields[key] = field;
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }
  }

  _createClass(CFFDict, [{
    key: 'decodeOperands',
    value: function decodeOperands(type, stream, ret, operands) {
      var _this = this;

      if (Array.isArray(type)) {
        return operands.map(function (op, i) {
          return _this.decodeOperands(type[i], stream, ret, [op]);
        });
      } else if (type.decode != null) {
        return type.decode(stream, ret, operands);
      } else {
        switch (type) {
          case 'number':
          case 'offset':
          case 'sid':
            return operands[0];
          case 'boolean':
            return !!operands[0];
          default:
            return operands;
        }
      }
    }
  }, {
    key: 'encodeOperands',
    value: function encodeOperands(type, stream, ctx, operands) {
      var _this2 = this;

      if (Array.isArray(type)) {
        return operands.map(function (op, i) {
          return _this2.encodeOperands(type[i], stream, ctx, op)[0];
        });
      } else if (type.encode != null) {
        return type.encode(stream, operands, ctx);
      } else if (typeof operands === 'number') {
        return [operands];
      } else if (typeof operands === 'boolean') {
        return [+operands];
      } else if (Array.isArray(operands)) {
        return operands;
      } else {
        return [operands];
      }
    }
  }, {
    key: 'decode',
    value: function decode(stream, parent) {
      var end = stream.pos + parent.length;
      var ret = {};
      var operands = [];

      // define hidden properties
      _Object$defineProperties(ret, {
        parent: { value: parent },
        _startOffset: { value: stream.pos }
      });

      // fill in defaults
      for (var key in this.fields) {
        var field = this.fields[key];
        ret[field[1]] = field[3];
      }

      while (stream.pos < end) {
        var b = stream.readUInt8();
        if (b <= 21) {
          if (b === 12) {
            b = b << 8 | stream.readUInt8();
          }

          var _field = this.fields[b];
          if (!_field) {
            throw new Error('Unknown operator ' + b);
          }

          var val = this.decodeOperands(_field[2], stream, ret, operands);
          if (val != null) {
            if (val instanceof restructure_src_utils.PropertyDescriptor) {
              _Object$defineProperty(ret, _field[1], val);
            } else {
              ret[_field[1]] = val;
            }
          }

          operands = [];
        } else {
          operands.push(CFFOperand.decode(stream, b));
        }
      }

      return ret;
    }
  }, {
    key: 'size',
    value: function size(dict, parent) {
      var includePointers = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;

      var ctx = {
        parent: parent,
        val: dict,
        pointerSize: 0,
        startOffset: parent.startOffset || 0
      };

      var len = 0;

      for (var k in this.fields) {
        var field = this.fields[k];
        var val = dict[field[1]];
        if (val == null || isEqual(val, field[3])) {
          continue;
        }

        var operands = this.encodeOperands(field[2], null, ctx, val);
        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
          for (var _iterator2 = _getIterator(operands), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
            var op = _step2.value;

            len += CFFOperand.size(op);
          }
        } catch (err) {
          _didIteratorError2 = true;
          _iteratorError2 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion2 && _iterator2.return) {
              _iterator2.return();
            }
          } finally {
            if (_didIteratorError2) {
              throw _iteratorError2;
            }
          }
        }

        var key = Array.isArray(field[0]) ? field[0] : [field[0]];
        len += key.length;
      }

      if (includePointers) {
        len += ctx.pointerSize;
      }

      return len;
    }
  }, {
    key: 'encode',
    value: function encode(stream, dict, parent) {
      var ctx = {
        pointers: [],
        startOffset: stream.pos,
        parent: parent,
        val: dict,
        pointerSize: 0
      };

      ctx.pointerOffset = stream.pos + this.size(dict, ctx, false);

      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = _getIterator(this.ops), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var field = _step3.value;

          var val = dict[field[1]];
          if (val == null || isEqual(val, field[3])) {
            continue;
          }

          var operands = this.encodeOperands(field[2], stream, ctx, val);
          var _iteratorNormalCompletion4 = true;
          var _didIteratorError4 = false;
          var _iteratorError4 = undefined;

          try {
            for (var _iterator4 = _getIterator(operands), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
              var op = _step4.value;

              CFFOperand.encode(stream, op);
            }
          } catch (err) {
            _didIteratorError4 = true;
            _iteratorError4 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion4 && _iterator4.return) {
                _iterator4.return();
              }
            } finally {
              if (_didIteratorError4) {
                throw _iteratorError4;
              }
            }
          }

          var key = Array.isArray(field[0]) ? field[0] : [field[0]];
          var _iteratorNormalCompletion5 = true;
          var _didIteratorError5 = false;
          var _iteratorError5 = undefined;

          try {
            for (var _iterator5 = _getIterator(key), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
              var _op = _step5.value;

              stream.writeUInt8(_op);
            }
          } catch (err) {
            _didIteratorError5 = true;
            _iteratorError5 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion5 && _iterator5.return) {
                _iterator5.return();
              }
            } finally {
              if (_didIteratorError5) {
                throw _iteratorError5;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3.return) {
            _iterator3.return();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }

      var i = 0;
      while (i < ctx.pointers.length) {
        var ptr = ctx.pointers[i++];
        ptr.type.encode(stream, ptr.val, ptr.parent);
      }

      return;
    }
  }]);

  return CFFDict;
}();

var CFFPointer = function (_r$Pointer) {
  _inherits(CFFPointer, _r$Pointer);

  function CFFPointer(type) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    _classCallCheck(this, CFFPointer);

    if (options.type == null) {
      options.type = 'global';
    }

    return _possibleConstructorReturn(this, (CFFPointer.__proto__ || _Object$getPrototypeOf(CFFPointer)).call(this, null, type, options));
  }

  _createClass(CFFPointer, [{
    key: 'decode',
    value: function decode(stream, parent, operands) {
      this.offsetType = {
        decode: function decode() {
          return operands[0];
        }
      };

      return _get(CFFPointer.prototype.__proto__ || _Object$getPrototypeOf(CFFPointer.prototype), 'decode', this).call(this, stream, parent, operands);
    }
  }, {
    key: 'encode',
    value: function encode(stream, value, ctx) {
      if (!stream) {
        // compute the size (so ctx.pointerSize is correct)
        this.offsetType = {
          size: function size() {
            return 0;
          }
        };

        this.size(value, ctx);
        return [new Ptr(0)];
      }

      var ptr = null;
      this.offsetType = {
        encode: function encode(stream, val) {
          return ptr = val;
        }
      };

      _get(CFFPointer.prototype.__proto__ || _Object$getPrototypeOf(CFFPointer.prototype), 'encode', this).call(this, stream, value, ctx);
      return [new Ptr(ptr)];
    }
  }]);

  return CFFPointer;
}(r.Pointer);

var Ptr = function () {
  function Ptr(val) {
    _classCallCheck(this, Ptr);

    this.val = val;
    this.forceLarge = true;
  }

  _createClass(Ptr, [{
    key: 'valueOf',
    value: function valueOf() {
      return this.val;
    }
  }]);

  return Ptr;
}();

var CFFPrivateDict = new CFFDict([
// key       name                    type                                          default
[6, 'BlueValues', 'delta', null], [7, 'OtherBlues', 'delta', null], [8, 'FamilyBlues', 'delta', null], [9, 'FamilyOtherBlues', 'delta', null], [[12, 9], 'BlueScale', 'number', 0.039625], [[12, 10], 'BlueShift', 'number', 7], [[12, 11], 'BlueFuzz', 'number', 1], [10, 'StdHW', 'number', null], [11, 'StdVW', 'number', null], [[12, 12], 'StemSnapH', 'delta', null], [[12, 13], 'StemSnapV', 'delta', null], [[12, 14], 'ForceBold', 'boolean', false], [[12, 17], 'LanguageGroup', 'number', 0], [[12, 18], 'ExpansionFactor', 'number', 0.06], [[12, 19], 'initialRandomSeed', 'number', 0], [20, 'defaultWidthX', 'number', 0], [21, 'nominalWidthX', 'number', 0], [19, 'Subrs', new CFFPointer(new CFFIndex(), { type: 'local' }), null]]);

// Automatically generated from Appendix A of the CFF specification; do
// not edit. Length should be 391.
var standardStrings = [".notdef", "space", "exclam", "quotedbl", "numbersign", "dollar", "percent", "ampersand", "quoteright", "parenleft", "parenright", "asterisk", "plus", "comma", "hyphen", "period", "slash", "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "colon", "semicolon", "less", "equal", "greater", "question", "at", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "bracketleft", "backslash", "bracketright", "asciicircum", "underscore", "quoteleft", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "braceleft", "bar", "braceright", "asciitilde", "exclamdown", "cent", "sterling", "fraction", "yen", "florin", "section", "currency", "quotesingle", "quotedblleft", "guillemotleft", "guilsinglleft", "guilsinglright", "fi", "fl", "endash", "dagger", "daggerdbl", "periodcentered", "paragraph", "bullet", "quotesinglbase", "quotedblbase", "quotedblright", "guillemotright", "ellipsis", "perthousand", "questiondown", "grave", "acute", "circumflex", "tilde", "macron", "breve", "dotaccent", "dieresis", "ring", "cedilla", "hungarumlaut", "ogonek", "caron", "emdash", "AE", "ordfeminine", "Lslash", "Oslash", "OE", "ordmasculine", "ae", "dotlessi", "lslash", "oslash", "oe", "germandbls", "onesuperior", "logicalnot", "mu", "trademark", "Eth", "onehalf", "plusminus", "Thorn", "onequarter", "divide", "brokenbar", "degree", "thorn", "threequarters", "twosuperior", "registered", "minus", "eth", "multiply", "threesuperior", "copyright", "Aacute", "Acircumflex", "Adieresis", "Agrave", "Aring", "Atilde", "Ccedilla", "Eacute", "Ecircumflex", "Edieresis", "Egrave", "Iacute", "Icircumflex", "Idieresis", "Igrave", "Ntilde", "Oacute", "Ocircumflex", "Odieresis", "Ograve", "Otilde", "Scaron", "Uacute", "Ucircumflex", "Udieresis", "Ugrave", "Yacute", "Ydieresis", "Zcaron", "aacute", "acircumflex", "adieresis", "agrave", "aring", "atilde", "ccedilla", "eacute", "ecircumflex", "edieresis", "egrave", "iacute", "icircumflex", "idieresis", "igrave", "ntilde", "oacute", "ocircumflex", "odieresis", "ograve", "otilde", "scaron", "uacute", "ucircumflex", "udieresis", "ugrave", "yacute", "ydieresis", "zcaron", "exclamsmall", "Hungarumlautsmall", "dollaroldstyle", "dollarsuperior", "ampersandsmall", "Acutesmall", "parenleftsuperior", "parenrightsuperior", "twodotenleader", "onedotenleader", "zerooldstyle", "oneoldstyle", "twooldstyle", "threeoldstyle", "fouroldstyle", "fiveoldstyle", "sixoldstyle", "sevenoldstyle", "eightoldstyle", "nineoldstyle", "commasuperior", "threequartersemdash", "periodsuperior", "questionsmall", "asuperior", "bsuperior", "centsuperior", "dsuperior", "esuperior", "isuperior", "lsuperior", "msuperior", "nsuperior", "osuperior", "rsuperior", "ssuperior", "tsuperior", "ff", "ffi", "ffl", "parenleftinferior", "parenrightinferior", "Circumflexsmall", "hyphensuperior", "Gravesmall", "Asmall", "Bsmall", "Csmall", "Dsmall", "Esmall", "Fsmall", "Gsmall", "Hsmall", "Ismall", "Jsmall", "Ksmall", "Lsmall", "Msmall", "Nsmall", "Osmall", "Psmall", "Qsmall", "Rsmall", "Ssmall", "Tsmall", "Usmall", "Vsmall", "Wsmall", "Xsmall", "Ysmall", "Zsmall", "colonmonetary", "onefitted", "rupiah", "Tildesmall", "exclamdownsmall", "centoldstyle", "Lslashsmall", "Scaronsmall", "Zcaronsmall", "Dieresissmall", "Brevesmall", "Caronsmall", "Dotaccentsmall", "Macronsmall", "figuredash", "hypheninferior", "Ogoneksmall", "Ringsmall", "Cedillasmall", "questiondownsmall", "oneeighth", "threeeighths", "fiveeighths", "seveneighths", "onethird", "twothirds", "zerosuperior", "foursuperior", "fivesuperior", "sixsuperior", "sevensuperior", "eightsuperior", "ninesuperior", "zeroinferior", "oneinferior", "twoinferior", "threeinferior", "fourinferior", "fiveinferior", "sixinferior", "seveninferior", "eightinferior", "nineinferior", "centinferior", "dollarinferior", "periodinferior", "commainferior", "Agravesmall", "Aacutesmall", "Acircumflexsmall", "Atildesmall", "Adieresissmall", "Aringsmall", "AEsmall", "Ccedillasmall", "Egravesmall", "Eacutesmall", "Ecircumflexsmall", "Edieresissmall", "Igravesmall", "Iacutesmall", "Icircumflexsmall", "Idieresissmall", "Ethsmall", "Ntildesmall", "Ogravesmall", "Oacutesmall", "Ocircumflexsmall", "Otildesmall", "Odieresissmall", "OEsmall", "Oslashsmall", "Ugravesmall", "Uacutesmall", "Ucircumflexsmall", "Udieresissmall", "Yacutesmall", "Thornsmall", "Ydieresissmall", "001.000", "001.001", "001.002", "001.003", "Black", "Bold", "Book", "Light", "Medium", "Regular", "Roman", "Semibold"];

var StandardEncoding = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'space', 'exclam', 'quotedbl', 'numbersign', 'dollar', 'percent', 'ampersand', 'quoteright', 'parenleft', 'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash', 'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'colon', 'semicolon', 'less', 'equal', 'greater', 'question', 'at', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'bracketleft', 'backslash', 'bracketright', 'asciicircum', 'underscore', 'quoteleft', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'braceleft', 'bar', 'braceright', 'asciitilde', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'exclamdown', 'cent', 'sterling', 'fraction', 'yen', 'florin', 'section', 'currency', 'quotesingle', 'quotedblleft', 'guillemotleft', 'guilsinglleft', 'guilsinglright', 'fi', 'fl', '', 'endash', 'dagger', 'daggerdbl', 'periodcentered', '', 'paragraph', 'bullet', 'quotesinglbase', 'quotedblbase', 'quotedblright', 'guillemotright', 'ellipsis', 'perthousand', '', 'questiondown', '', 'grave', 'acute', 'circumflex', 'tilde', 'macron', 'breve', 'dotaccent', 'dieresis', '', 'ring', 'cedilla', '', 'hungarumlaut', 'ogonek', 'caron', 'emdash', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'AE', '', 'ordfeminine', '', '', '', '', 'Lslash', 'Oslash', 'OE', 'ordmasculine', '', '', '', '', '', 'ae', '', '', '', 'dotlessi', '', '', 'lslash', 'oslash', 'oe', 'germandbls'];

var ExpertEncoding = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'space', 'exclamsmall', 'Hungarumlautsmall', '', 'dollaroldstyle', 'dollarsuperior', 'ampersandsmall', 'Acutesmall', 'parenleftsuperior', 'parenrightsuperior', 'twodotenleader', 'onedotenleader', 'comma', 'hyphen', 'period', 'fraction', 'zerooldstyle', 'oneoldstyle', 'twooldstyle', 'threeoldstyle', 'fouroldstyle', 'fiveoldstyle', 'sixoldstyle', 'sevenoldstyle', 'eightoldstyle', 'nineoldstyle', 'colon', 'semicolon', 'commasuperior', 'threequartersemdash', 'periodsuperior', 'questionsmall', '', 'asuperior', 'bsuperior', 'centsuperior', 'dsuperior', 'esuperior', '', '', 'isuperior', '', '', 'lsuperior', 'msuperior', 'nsuperior', 'osuperior', '', '', 'rsuperior', 'ssuperior', 'tsuperior', '', 'ff', 'fi', 'fl', 'ffi', 'ffl', 'parenleftinferior', '', 'parenrightinferior', 'Circumflexsmall', 'hyphensuperior', 'Gravesmall', 'Asmall', 'Bsmall', 'Csmall', 'Dsmall', 'Esmall', 'Fsmall', 'Gsmall', 'Hsmall', 'Ismall', 'Jsmall', 'Ksmall', 'Lsmall', 'Msmall', 'Nsmall', 'Osmall', 'Psmall', 'Qsmall', 'Rsmall', 'Ssmall', 'Tsmall', 'Usmall', 'Vsmall', 'Wsmall', 'Xsmall', 'Ysmall', 'Zsmall', 'colonmonetary', 'onefitted', 'rupiah', 'Tildesmall', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'exclamdownsmall', 'centoldstyle', 'Lslashsmall', '', '', 'Scaronsmall', 'Zcaronsmall', 'Dieresissmall', 'Brevesmall', 'Caronsmall', '', 'Dotaccentsmall', '', '', 'Macronsmall', '', '', 'figuredash', 'hypheninferior', '', '', 'Ogoneksmall', 'Ringsmall', 'Cedillasmall', '', '', '', 'onequarter', 'onehalf', 'threequarters', 'questiondownsmall', 'oneeighth', 'threeeighths', 'fiveeighths', 'seveneighths', 'onethird', 'twothirds', '', '', 'zerosuperior', 'onesuperior', 'twosuperior', 'threesuperior', 'foursuperior', 'fivesuperior', 'sixsuperior', 'sevensuperior', 'eightsuperior', 'ninesuperior', 'zeroinferior', 'oneinferior', 'twoinferior', 'threeinferior', 'fourinferior', 'fiveinferior', 'sixinferior', 'seveninferior', 'eightinferior', 'nineinferior', 'centinferior', 'dollarinferior', 'periodinferior', 'commainferior', 'Agravesmall', 'Aacutesmall', 'Acircumflexsmall', 'Atildesmall', 'Adieresissmall', 'Aringsmall', 'AEsmall', 'Ccedillasmall', 'Egravesmall', 'Eacutesmall', 'Ecircumflexsmall', 'Edieresissmall', 'Igravesmall', 'Iacutesmall', 'Icircumflexsmall', 'Idieresissmall', 'Ethsmall', 'Ntildesmall', 'Ogravesmall', 'Oacutesmall', 'Ocircumflexsmall', 'Otildesmall', 'Odieresissmall', 'OEsmall', 'Oslashsmall', 'Ugravesmall', 'Uacutesmall', 'Ucircumflexsmall', 'Udieresissmall', 'Yacutesmall', 'Thornsmall', 'Ydieresissmall'];

var ISOAdobeCharset = ['.notdef', 'space', 'exclam', 'quotedbl', 'numbersign', 'dollar', 'percent', 'ampersand', 'quoteright', 'parenleft', 'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash', 'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'colon', 'semicolon', 'less', 'equal', 'greater', 'question', 'at', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'bracketleft', 'backslash', 'bracketright', 'asciicircum', 'underscore', 'quoteleft', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'braceleft', 'bar', 'braceright', 'asciitilde', 'exclamdown', 'cent', 'sterling', 'fraction', 'yen', 'florin', 'section', 'currency', 'quotesingle', 'quotedblleft', 'guillemotleft', 'guilsinglleft', 'guilsinglright', 'fi', 'fl', 'endash', 'dagger', 'daggerdbl', 'periodcentered', 'paragraph', 'bullet', 'quotesinglbase', 'quotedblbase', 'quotedblright', 'guillemotright', 'ellipsis', 'perthousand', 'questiondown', 'grave', 'acute', 'circumflex', 'tilde', 'macron', 'breve', 'dotaccent', 'dieresis', 'ring', 'cedilla', 'hungarumlaut', 'ogonek', 'caron', 'emdash', 'AE', 'ordfeminine', 'Lslash', 'Oslash', 'OE', 'ordmasculine', 'ae', 'dotlessi', 'lslash', 'oslash', 'oe', 'germandbls', 'onesuperior', 'logicalnot', 'mu', 'trademark', 'Eth', 'onehalf', 'plusminus', 'Thorn', 'onequarter', 'divide', 'brokenbar', 'degree', 'thorn', 'threequarters', 'twosuperior', 'registered', 'minus', 'eth', 'multiply', 'threesuperior', 'copyright', 'Aacute', 'Acircumflex', 'Adieresis', 'Agrave', 'Aring', 'Atilde', 'Ccedilla', 'Eacute', 'Ecircumflex', 'Edieresis', 'Egrave', 'Iacute', 'Icircumflex', 'Idieresis', 'Igrave', 'Ntilde', 'Oacute', 'Ocircumflex', 'Odieresis', 'Ograve', 'Otilde', 'Scaron', 'Uacute', 'Ucircumflex', 'Udieresis', 'Ugrave', 'Yacute', 'Ydieresis', 'Zcaron', 'aacute', 'acircumflex', 'adieresis', 'agrave', 'aring', 'atilde', 'ccedilla', 'eacute', 'ecircumflex', 'edieresis', 'egrave', 'iacute', 'icircumflex', 'idieresis', 'igrave', 'ntilde', 'oacute', 'ocircumflex', 'odieresis', 'ograve', 'otilde', 'scaron', 'uacute', 'ucircumflex', 'udieresis', 'ugrave', 'yacute', 'ydieresis', 'zcaron'];

var ExpertCharset = ['.notdef', 'space', 'exclamsmall', 'Hungarumlautsmall', 'dollaroldstyle', 'dollarsuperior', 'ampersandsmall', 'Acutesmall', 'parenleftsuperior', 'parenrightsuperior', 'twodotenleader', 'onedotenleader', 'comma', 'hyphen', 'period', 'fraction', 'zerooldstyle', 'oneoldstyle', 'twooldstyle', 'threeoldstyle', 'fouroldstyle', 'fiveoldstyle', 'sixoldstyle', 'sevenoldstyle', 'eightoldstyle', 'nineoldstyle', 'colon', 'semicolon', 'commasuperior', 'threequartersemdash', 'periodsuperior', 'questionsmall', 'asuperior', 'bsuperior', 'centsuperior', 'dsuperior', 'esuperior', 'isuperior', 'lsuperior', 'msuperior', 'nsuperior', 'osuperior', 'rsuperior', 'ssuperior', 'tsuperior', 'ff', 'fi', 'fl', 'ffi', 'ffl', 'parenleftinferior', 'parenrightinferior', 'Circumflexsmall', 'hyphensuperior', 'Gravesmall', 'Asmall', 'Bsmall', 'Csmall', 'Dsmall', 'Esmall', 'Fsmall', 'Gsmall', 'Hsmall', 'Ismall', 'Jsmall', 'Ksmall', 'Lsmall', 'Msmall', 'Nsmall', 'Osmall', 'Psmall', 'Qsmall', 'Rsmall', 'Ssmall', 'Tsmall', 'Usmall', 'Vsmall', 'Wsmall', 'Xsmall', 'Ysmall', 'Zsmall', 'colonmonetary', 'onefitted', 'rupiah', 'Tildesmall', 'exclamdownsmall', 'centoldstyle', 'Lslashsmall', 'Scaronsmall', 'Zcaronsmall', 'Dieresissmall', 'Brevesmall', 'Caronsmall', 'Dotaccentsmall', 'Macronsmall', 'figuredash', 'hypheninferior', 'Ogoneksmall', 'Ringsmall', 'Cedillasmall', 'onequarter', 'onehalf', 'threequarters', 'questiondownsmall', 'oneeighth', 'threeeighths', 'fiveeighths', 'seveneighths', 'onethird', 'twothirds', 'zerosuperior', 'onesuperior', 'twosuperior', 'threesuperior', 'foursuperior', 'fivesuperior', 'sixsuperior', 'sevensuperior', 'eightsuperior', 'ninesuperior', 'zeroinferior', 'oneinferior', 'twoinferior', 'threeinferior', 'fourinferior', 'fiveinferior', 'sixinferior', 'seveninferior', 'eightinferior', 'nineinferior', 'centinferior', 'dollarinferior', 'periodinferior', 'commainferior', 'Agravesmall', 'Aacutesmall', 'Acircumflexsmall', 'Atildesmall', 'Adieresissmall', 'Aringsmall', 'AEsmall', 'Ccedillasmall', 'Egravesmall', 'Eacutesmall', 'Ecircumflexsmall', 'Edieresissmall', 'Igravesmall', 'Iacutesmall', 'Icircumflexsmall', 'Idieresissmall', 'Ethsmall', 'Ntildesmall', 'Ogravesmall', 'Oacutesmall', 'Ocircumflexsmall', 'Otildesmall', 'Odieresissmall', 'OEsmall', 'Oslashsmall', 'Ugravesmall', 'Uacutesmall', 'Ucircumflexsmall', 'Udieresissmall', 'Yacutesmall', 'Thornsmall', 'Ydieresissmall'];

var ExpertSubsetCharset = ['.notdef', 'space', 'dollaroldstyle', 'dollarsuperior', 'parenleftsuperior', 'parenrightsuperior', 'twodotenleader', 'onedotenleader', 'comma', 'hyphen', 'period', 'fraction', 'zerooldstyle', 'oneoldstyle', 'twooldstyle', 'threeoldstyle', 'fouroldstyle', 'fiveoldstyle', 'sixoldstyle', 'sevenoldstyle', 'eightoldstyle', 'nineoldstyle', 'colon', 'semicolon', 'commasuperior', 'threequartersemdash', 'periodsuperior', 'asuperior', 'bsuperior', 'centsuperior', 'dsuperior', 'esuperior', 'isuperior', 'lsuperior', 'msuperior', 'nsuperior', 'osuperior', 'rsuperior', 'ssuperior', 'tsuperior', 'ff', 'fi', 'fl', 'ffi', 'ffl', 'parenleftinferior', 'parenrightinferior', 'hyphensuperior', 'colonmonetary', 'onefitted', 'rupiah', 'centoldstyle', 'figuredash', 'hypheninferior', 'onequarter', 'onehalf', 'threequarters', 'oneeighth', 'threeeighths', 'fiveeighths', 'seveneighths', 'onethird', 'twothirds', 'zerosuperior', 'onesuperior', 'twosuperior', 'threesuperior', 'foursuperior', 'fivesuperior', 'sixsuperior', 'sevensuperior', 'eightsuperior', 'ninesuperior', 'zeroinferior', 'oneinferior', 'twoinferior', 'threeinferior', 'fourinferior', 'fiveinferior', 'sixinferior', 'seveninferior', 'eightinferior', 'nineinferior', 'centinferior', 'dollarinferior', 'periodinferior', 'commainferior'];

// Checks if an operand is an index of a predefined value,
// otherwise delegates to the provided type.

var PredefinedOp = function () {
  function PredefinedOp(predefinedOps, type) {
    _classCallCheck(this, PredefinedOp);

    this.predefinedOps = predefinedOps;
    this.type = type;
  }

  _createClass(PredefinedOp, [{
    key: 'decode',
    value: function decode(stream, parent, operands) {
      if (this.predefinedOps[operands[0]]) {
        return this.predefinedOps[operands[0]];
      }

      return this.type.decode(stream, parent, operands);
    }
  }, {
    key: 'size',
    value: function size(value, ctx) {
      return this.type.size(value, ctx);
    }
  }, {
    key: 'encode',
    value: function encode(stream, value, ctx) {
      var index = this.predefinedOps.indexOf(value);
      if (index !== -1) {
        return index;
      }

      return this.type.encode(stream, value, ctx);
    }
  }]);

  return PredefinedOp;
}();

var CFFEncodingVersion = function (_r$Number) {
  _inherits(CFFEncodingVersion, _r$Number);

  function CFFEncodingVersion() {
    _classCallCheck(this, CFFEncodingVersion);

    return _possibleConstructorReturn(this, (CFFEncodingVersion.__proto__ || _Object$getPrototypeOf(CFFEncodingVersion)).call(this, 'UInt8'));
  }

  _createClass(CFFEncodingVersion, [{
    key: 'decode',
    value: function decode(stream) {
      return r.uint8.decode(stream) & 0x7f;
    }
  }]);

  return CFFEncodingVersion;
}(r.Number);

var Range1 = new r.Struct({
  first: r.uint16,
  nLeft: r.uint8
});

var Range2 = new r.Struct({
  first: r.uint16,
  nLeft: r.uint16
});

var CFFCustomEncoding = new r.VersionedStruct(new CFFEncodingVersion(), {
  0: {
    nCodes: r.uint8,
    codes: new r.Array(r.uint8, 'nCodes')
  },

  1: {
    nRanges: r.uint8,
    ranges: new r.Array(Range1, 'nRanges')
  }

  // TODO: supplement?
});

var CFFEncoding = new PredefinedOp([StandardEncoding, ExpertEncoding], new CFFPointer(CFFCustomEncoding, { lazy: true }));

// Decodes an array of ranges until the total
// length is equal to the provided length.

var RangeArray = function (_r$Array) {
  _inherits(RangeArray, _r$Array);

  function RangeArray() {
    _classCallCheck(this, RangeArray);

    return _possibleConstructorReturn(this, (RangeArray.__proto__ || _Object$getPrototypeOf(RangeArray)).apply(this, arguments));
  }

  _createClass(RangeArray, [{
    key: 'decode',
    value: function decode(stream, parent) {
      var length = restructure_src_utils.resolveLength(this.length, stream, parent);
      var count = 0;
      var res = [];
      while (count < length) {
        var range = this.type.decode(stream, parent);
        range.offset = count;
        count += range.nLeft + 1;
        res.push(range);
      }

      return res;
    }
  }]);

  return RangeArray;
}(r.Array);

var CFFCustomCharset = new r.VersionedStruct(r.uint8, {
  0: {
    glyphs: new r.Array(r.uint16, function (t) {
      return t.parent.CharStrings.length - 1;
    })
  },

  1: {
    ranges: new RangeArray(Range1, function (t) {
      return t.parent.CharStrings.length - 1;
    })
  },

  2: {
    ranges: new RangeArray(Range2, function (t) {
      return t.parent.CharStrings.length - 1;
    })
  }
});

var CFFCharset = new PredefinedOp([ISOAdobeCharset, ExpertCharset, ExpertSubsetCharset], new CFFPointer(CFFCustomCharset, { lazy: true }));

var FDRange = new r.Struct({
  first: r.uint16,
  fd: r.uint8
});

var FDSelect = new r.VersionedStruct(r.uint8, {
  0: {
    fds: new r.Array(r.uint8, function (t) {
      return t.parent.CharStrings.length;
    })
  },

  3: {
    nRanges: r.uint16,
    ranges: new r.Array(FDRange, 'nRanges'),
    sentinel: r.uint16
  }
});

var ptr = new CFFPointer(CFFPrivateDict);

var CFFPrivateOp = function () {
  function CFFPrivateOp() {
    _classCallCheck(this, CFFPrivateOp);
  }

  _createClass(CFFPrivateOp, [{
    key: 'decode',
    value: function decode(stream, parent, operands) {
      parent.length = operands[0];
      return ptr.decode(stream, parent, [operands[1]]);
    }
  }, {
    key: 'size',
    value: function size(dict, ctx) {
      return [CFFPrivateDict.size(dict, ctx, false), ptr.size(dict, ctx)[0]];
    }
  }, {
    key: 'encode',
    value: function encode(stream, dict, ctx) {
      return [CFFPrivateDict.size(dict, ctx, false), ptr.encode(stream, dict, ctx)[0]];
    }
  }]);

  return CFFPrivateOp;
}();

var FontDict = new CFFDict([
// key       name                   type(s)                                 default
[18, 'Private', new CFFPrivateOp(), null], [[12, 38], 'FontName', 'sid', null]]);

var CFFTopDict = new CFFDict([
// key       name                   type(s)                                 default
[[12, 30], 'ROS', ['sid', 'sid', 'number'], null], [0, 'version', 'sid', null], [1, 'Notice', 'sid', null], [[12, 0], 'Copyright', 'sid', null], [2, 'FullName', 'sid', null], [3, 'FamilyName', 'sid', null], [4, 'Weight', 'sid', null], [[12, 1], 'isFixedPitch', 'boolean', false], [[12, 2], 'ItalicAngle', 'number', 0], [[12, 3], 'UnderlinePosition', 'number', -100], [[12, 4], 'UnderlineThickness', 'number', 50], [[12, 5], 'PaintType', 'number', 0], [[12, 6], 'CharstringType', 'number', 2], [[12, 7], 'FontMatrix', 'array', [0.001, 0, 0, 0.001, 0, 0]], [13, 'UniqueID', 'number', null], [5, 'FontBBox', 'array', [0, 0, 0, 0]], [[12, 8], 'StrokeWidth', 'number', 0], [14, 'XUID', 'array', null], [15, 'charset', CFFCharset, ISOAdobeCharset], [16, 'Encoding', CFFEncoding, StandardEncoding], [17, 'CharStrings', new CFFPointer(new CFFIndex()), null], [18, 'Private', new CFFPrivateOp(), null], [[12, 20], 'SyntheticBase', 'number', null], [[12, 21], 'PostScript', 'sid', null], [[12, 22], 'BaseFontName', 'sid', null], [[12, 23], 'BaseFontBlend', 'delta', null],

// CID font specific
[[12, 31], 'CIDFontVersion', 'number', 0], [[12, 32], 'CIDFontRevision', 'number', 0], [[12, 33], 'CIDFontType', 'number', 0], [[12, 34], 'CIDCount', 'number', 8720], [[12, 35], 'UIDBase', 'number', null], [[12, 37], 'FDSelect', new CFFPointer(FDSelect), null], [[12, 36], 'FDArray', new CFFPointer(new CFFIndex(FontDict)), null], [[12, 38], 'FontName', 'sid', null]]);

var CFFHeader = new r.Struct({
  majorVersion: r.uint8,
  minorVersion: r.uint8,
  hdrSize: r.uint8,
  offSize: r.uint8
});

var CFFTop = new r.Struct({
  header: CFFHeader,
  nameIndex: new CFFIndex(new r.String('length')),
  topDictIndex: new CFFIndex(CFFTopDict),
  stringIndex: new CFFIndex(new r.String('length')),
  globalSubrIndex: new CFFIndex()
});

var CFFFont = function () {
  function CFFFont(stream) {
    _classCallCheck(this, CFFFont);

    this.stream = stream;
    this.decode();
  }

  _createClass(CFFFont, [{
    key: 'decode',
    value: function decode() {
      var start = this.stream.pos;
      var top = CFFTop.decode(this.stream);
      for (var key in top) {
        var val = top[key];
        this[key] = val;
      }

      if (this.topDictIndex.length !== 1) {
        throw new Error("Only a single font is allowed in CFF");
      }

      this.isCIDFont = this.topDict.ROS != null;

      return this;
    }
  }, {
    key: 'string',
    value: function string(sid) {
      if (sid < standardStrings.length) {
        return standardStrings[sid];
      }

      return this.stringIndex[sid - standardStrings.length];
    }
  }, {
    key: 'getCharString',
    value: function getCharString(glyph) {
      this.stream.pos = this.topDict.CharStrings[glyph].offset;
      return this.stream.readBuffer(this.topDict.CharStrings[glyph].length);
    }
  }, {
    key: 'getGlyphName',
    value: function getGlyphName(gid) {
      var charset = this.topDict.charset;

      if (Array.isArray(charset)) {
        return charset[gid];
      }

      if (gid === 0) {
        return '.notdef';
      }

      gid -= 1;

      switch (charset.version) {
        case 0:
          return this.string(charset.glyphs[gid]);

        case 1:
        case 2:
          for (var i = 0; i < charset.ranges.length; i++) {
            var range = charset.ranges[i];
            if (range.offset <= gid && gid <= range.offset + range.nLeft) {
              return this.string(range.first + (gid - range.offset));
            }
          }
          break;
      }

      return null;
    }
  }, {
    key: 'fdForGlyph',
    value: function fdForGlyph(gid) {
      if (!this.topDict.FDSelect) {
        return null;
      }

      switch (this.topDict.FDSelect.version) {
        case 0:
          return this.topDict.FDSelect.fds[gid];

        case 3:
          var ranges = this.topDict.FDSelect.ranges;

          var low = 0;
          var high = ranges.length - 1;

          while (low <= high) {
            var mid = low + high >> 1;

            if (gid < ranges[mid].first) {
              high = mid - 1;
            } else if (mid < high && gid > ranges[mid + 1].first) {
              low = mid + 1;
            } else {
              return ranges[mid].fd;
            }
          }
        default:
          throw new Error('Unknown FDSelect version: ' + this.topDict.FDSelect.version);
      }
    }
  }, {
    key: 'privateDictForGlyph',
    value: function privateDictForGlyph(gid) {
      if (this.topDict.FDSelect) {
        var fd = this.fdForGlyph(gid);
        if (this.topDict.FDArray[fd]) {
          return this.topDict.FDArray[fd].Private;
        }

        return null;
      }

      return this.topDict.Private;
    }
  }, {
    key: 'topDict',
    get: function get() {
      return this.topDictIndex[0];
    }
  }, {
    key: 'postscriptName',
    get: function get() {
      return this.nameIndex[0];
    }
  }, {
    key: 'fullName',
    get: function get() {
      return this.string(this.topDict.FullName);
    }
  }, {
    key: 'familyName',
    get: function get() {
      return this.string(this.topDict.FamilyName);
    }
  }], [{
    key: 'decode',
    value: function decode(stream) {
      return new CFFFont(stream);
    }
  }]);

  return CFFFont;
}();

var VerticalOrigin = new r.Struct({
  glyphIndex: r.uint16,
  vertOriginY: r.int16
});

var VORG = new r.Struct({
  majorVersion: r.uint16,
  minorVersion: r.uint16,
  defaultVertOriginY: r.int16,
  numVertOriginYMetrics: r.uint16,
  metrics: new r.Array(VerticalOrigin, 'numVertOriginYMetrics')
});

var BigMetrics = new r.Struct({
  height: r.uint8,
  width: r.uint8,
  horiBearingX: r.int8,
  horiBearingY: r.int8,
  horiAdvance: r.uint8,
  vertBearingX: r.int8,
  vertBearingY: r.int8,
  vertAdvance: r.uint8
});

var SmallMetrics = new r.Struct({
  height: r.uint8,
  width: r.uint8,
  bearingX: r.int8,
  bearingY: r.int8,
  advance: r.uint8
});

var EBDTComponent = new r.Struct({
  glyph: r.uint16,
  xOffset: r.int8,
  yOffset: r.int8
});

var ByteAligned = function ByteAligned() {
  _classCallCheck(this, ByteAligned);
};

var BitAligned = function BitAligned() {
  _classCallCheck(this, BitAligned);
};

var glyph = new r.VersionedStruct('version', {
  1: {
    metrics: SmallMetrics,
    data: ByteAligned
  },

  2: {
    metrics: SmallMetrics,
    data: BitAligned
  },

  // format 3 is deprecated
  // format 4 is not supported by Microsoft

  5: {
    data: BitAligned
  },

  6: {
    metrics: BigMetrics,
    data: ByteAligned
  },

  7: {
    metrics: BigMetrics,
    data: BitAligned
  },

  8: {
    metrics: SmallMetrics,
    pad: new r.Reserved(r.uint8),
    numComponents: r.uint16,
    components: new r.Array(EBDTComponent, 'numComponents')
  },

  9: {
    metrics: BigMetrics,
    pad: new r.Reserved(r.uint8),
    numComponents: r.uint16,
    components: new r.Array(EBDTComponent, 'numComponents')
  },

  17: {
    metrics: SmallMetrics,
    dataLen: r.uint32,
    data: new r.Buffer('dataLen')
  },

  18: {
    metrics: BigMetrics,
    dataLen: r.uint32,
    data: new r.Buffer('dataLen')
  },

  19: {
    dataLen: r.uint32,
    data: new r.Buffer('dataLen')
  }
});

var SBitLineMetrics = new r.Struct({
  ascender: r.int8,
  descender: r.int8,
  widthMax: r.uint8,
  caretSlopeNumerator: r.int8,
  caretSlopeDenominator: r.int8,
  caretOffset: r.int8,
  minOriginSB: r.int8,
  minAdvanceSB: r.int8,
  maxBeforeBL: r.int8,
  minAfterBL: r.int8,
  pad: new r.Reserved(r.int8, 2)
});

var CodeOffsetPair = new r.Struct({
  glyphCode: r.uint16,
  offset: r.uint16
});

var IndexSubtable = new r.VersionedStruct(r.uint16, {
  header: {
    imageFormat: r.uint16,
    imageDataOffset: r.uint32
  },

  1: {
    offsetArray: new r.Array(r.uint32, function (t) {
      return t.parent.lastGlyphIndex - t.parent.firstGlyphIndex + 1;
    })
  },

  2: {
    imageSize: r.uint32,
    bigMetrics: BigMetrics
  },

  3: {
    offsetArray: new r.Array(r.uint16, function (t) {
      return t.parent.lastGlyphIndex - t.parent.firstGlyphIndex + 1;
    })
  },

  4: {
    numGlyphs: r.uint32,
    glyphArray: new r.Array(CodeOffsetPair, function (t) {
      return t.numGlyphs + 1;
    })
  },

  5: {
    imageSize: r.uint32,
    bigMetrics: BigMetrics,
    numGlyphs: r.uint32,
    glyphCodeArray: new r.Array(r.uint16, 'numGlyphs')
  }
});

var IndexSubtableArray = new r.Struct({
  firstGlyphIndex: r.uint16,
  lastGlyphIndex: r.uint16,
  subtable: new r.Pointer(r.uint32, IndexSubtable)
});

var BitmapSizeTable = new r.Struct({
  indexSubTableArray: new r.Pointer(r.uint32, new r.Array(IndexSubtableArray, 1), { type: 'parent' }),
  indexTablesSize: r.uint32,
  numberOfIndexSubTables: r.uint32,
  colorRef: r.uint32,
  hori: SBitLineMetrics,
  vert: SBitLineMetrics,
  startGlyphIndex: r.uint16,
  endGlyphIndex: r.uint16,
  ppemX: r.uint8,
  ppemY: r.uint8,
  bitDepth: r.uint8,
  flags: new r.Bitfield(r.uint8, ['horizontal', 'vertical'])
});

var EBLC = new r.Struct({
  version: r.uint32, // 0x00020000
  numSizes: r.uint32,
  sizes: new r.Array(BitmapSizeTable, 'numSizes')
});

var ImageTable = new r.Struct({
  ppem: r.uint16,
  resolution: r.uint16,
  imageOffsets: new r.Array(new r.Pointer(r.uint32, 'void'), function (t) {
    return t.parent.parent.maxp.numGlyphs + 1;
  })
});

// This is the Apple sbix table, used by the "Apple Color Emoji" font.
// It includes several image tables with images for each bitmap glyph
// of several different sizes.
var sbix = new r.Struct({
  version: r.uint16,
  flags: new r.Bitfield(r.uint16, ['renderOutlines']),
  numImgTables: r.uint32,
  imageTables: new r.Array(new r.Pointer(r.uint32, ImageTable), 'numImgTables')
});

var LayerRecord = new r.Struct({
  gid: r.uint16, // Glyph ID of layer glyph (must be in z-order from bottom to top).
  paletteIndex: r.uint16 // Index value to use in the appropriate palette. This value must
}); // be less than numPaletteEntries in the CPAL table, except for
// the special case noted below. Each palette entry is 16 bits.
// A palette index of 0xFFFF is a special case indicating that
// the text foreground color should be used.

var BaseGlyphRecord = new r.Struct({
  gid: r.uint16, // Glyph ID of reference glyph. This glyph is for reference only
  // and is not rendered for color.
  firstLayerIndex: r.uint16, // Index (from beginning of the Layer Records) to the layer record.
  // There will be numLayers consecutive entries for this base glyph.
  numLayers: r.uint16
});

var COLR = new r.Struct({
  version: r.uint16,
  numBaseGlyphRecords: r.uint16,
  baseGlyphRecord: new r.Pointer(r.uint32, new r.Array(BaseGlyphRecord, 'numBaseGlyphRecords')),
  layerRecords: new r.Pointer(r.uint32, new r.Array(LayerRecord, 'numLayerRecords'), { lazy: true }),
  numLayerRecords: r.uint16
});

var ColorRecord = new r.Struct({
  blue: r.uint8,
  green: r.uint8,
  red: r.uint8,
  alpha: r.uint8
});

var CPAL = new r.Struct({
  version: r.uint16,
  numPaletteEntries: r.uint16,
  numPalettes: r.uint16,
  numColorRecords: r.uint16,
  colorRecords: new r.Pointer(r.uint32, new r.Array(ColorRecord, 'numColorRecords')),
  colorRecordIndices: new r.Array(r.uint16, 'numPalettes')
});

//########################
// Scripts and Languages #
//########################

var LangSysTable = new r.Struct({
  reserved: new r.Reserved(r.uint16),
  reqFeatureIndex: r.uint16,
  featureCount: r.uint16,
  featureIndexes: new r.Array(r.uint16, 'featureCount')
});

var LangSysRecord = new r.Struct({
  tag: new r.String(4),
  langSys: new r.Pointer(r.uint16, LangSysTable, { type: 'parent' })
});

var Script = new r.Struct({
  defaultLangSys: new r.Pointer(r.uint16, LangSysTable),
  count: r.uint16,
  langSysRecords: new r.Array(LangSysRecord, 'count')
});

var ScriptRecord = new r.Struct({
  tag: new r.String(4),
  script: new r.Pointer(r.uint16, Script, { type: 'parent' })
});

var ScriptList = new r.Array(ScriptRecord, r.uint16);

//#######################
// Features and Lookups #
//#######################

var Feature = new r.Struct({
  featureParams: r.uint16, // pointer
  lookupCount: r.uint16,
  lookupListIndexes: new r.Array(r.uint16, 'lookupCount')
});

var FeatureRecord = new r.Struct({
  tag: new r.String(4),
  feature: new r.Pointer(r.uint16, Feature, { type: 'parent' })
});

var FeatureList = new r.Array(FeatureRecord, r.uint16);

var LookupFlags = new r.Bitfield(r.uint16, ['rightToLeft', 'ignoreBaseGlyphs', 'ignoreLigatures', 'ignoreMarks', 'useMarkFilteringSet', null, 'markAttachmentType']);

function LookupList(SubTable) {
  var Lookup = new r.Struct({
    lookupType: r.uint16,
    flags: LookupFlags,
    subTableCount: r.uint16,
    subTables: new r.Array(new r.Pointer(r.uint16, SubTable), 'subTableCount'),
    markFilteringSet: r.uint16 // TODO: only present when flags says so...
  });

  return new r.LazyArray(new r.Pointer(r.uint16, Lookup), r.uint16);
}

//#################
// Coverage Table #
//#################

var RangeRecord = new r.Struct({
  start: r.uint16,
  end: r.uint16,
  startCoverageIndex: r.uint16
});

var Coverage = new r.VersionedStruct(r.uint16, {
  1: {
    glyphCount: r.uint16,
    glyphs: new r.Array(r.uint16, 'glyphCount')
  },
  2: {
    rangeCount: r.uint16,
    rangeRecords: new r.Array(RangeRecord, 'rangeCount')
  }
});

//#########################
// Class Definition Table #
//#########################

var ClassRangeRecord = new r.Struct({
  start: r.uint16,
  end: r.uint16,
  class: r.uint16
});

var ClassDef = new r.VersionedStruct(r.uint16, {
  1: { // Class array
    startGlyph: r.uint16,
    glyphCount: r.uint16,
    classValueArray: new r.Array(r.uint16, 'glyphCount')
  },
  2: { // Class ranges
    classRangeCount: r.uint16,
    classRangeRecord: new r.Array(ClassRangeRecord, 'classRangeCount')
  }
});

//###############
// Device Table #
//###############

var Device = new r.Struct({
  startSize: r.uint16,
  endSize: r.uint16,
  deltaFormat: r.uint16
});

//#############################################
// Contextual Substitution/Positioning Tables #
//#############################################

var LookupRecord = new r.Struct({
  sequenceIndex: r.uint16,
  lookupListIndex: r.uint16
});

var Rule = new r.Struct({
  glyphCount: r.uint16,
  lookupCount: r.uint16,
  input: new r.Array(r.uint16, function (t) {
    return t.glyphCount - 1;
  }),
  lookupRecords: new r.Array(LookupRecord, 'lookupCount')
});

var RuleSet = new r.Array(new r.Pointer(r.uint16, Rule), r.uint16);

var ClassRule = new r.Struct({
  glyphCount: r.uint16,
  lookupCount: r.uint16,
  classes: new r.Array(r.uint16, function (t) {
    return t.glyphCount - 1;
  }),
  lookupRecords: new r.Array(LookupRecord, 'lookupCount')
});

var ClassSet = new r.Array(new r.Pointer(r.uint16, ClassRule), r.uint16);

var Context = new r.VersionedStruct(r.uint16, {
  1: { // Simple context
    coverage: new r.Pointer(r.uint16, Coverage),
    ruleSetCount: r.uint16,
    ruleSets: new r.Array(new r.Pointer(r.uint16, RuleSet), 'ruleSetCount')
  },
  2: { // Class-based context
    coverage: new r.Pointer(r.uint16, Coverage),
    classDef: new r.Pointer(r.uint16, ClassDef),
    classSetCnt: r.uint16,
    classSet: new r.Array(new r.Pointer(r.uint16, ClassSet), 'classSetCnt')
  },
  3: {
    glyphCount: r.uint16,
    lookupCount: r.uint16,
    coverages: new r.Array(new r.Pointer(r.uint16, Coverage), 'glyphCount'),
    lookupRecords: new r.Array(LookupRecord, 'lookupCount')
  }
});

//######################################################
// Chaining Contextual Substitution/Positioning Tables #
//######################################################

var ChainRule = new r.Struct({
  backtrackGlyphCount: r.uint16,
  backtrack: new r.Array(r.uint16, 'backtrackGlyphCount'),
  inputGlyphCount: r.uint16,
  input: new r.Array(r.uint16, function (t) {
    return t.inputGlyphCount - 1;
  }),
  lookaheadGlyphCount: r.uint16,
  lookahead: new r.Array(r.uint16, 'lookaheadGlyphCount'),
  lookupCount: r.uint16,
  lookupRecords: new r.Array(LookupRecord, 'lookupCount')
});

var ChainRuleSet = new r.Array(new r.Pointer(r.uint16, ChainRule), r.uint16);

var ChainingContext = new r.VersionedStruct(r.uint16, {
  1: { // Simple context glyph substitution
    coverage: new r.Pointer(r.uint16, Coverage),
    chainCount: r.uint16,
    chainRuleSets: new r.Array(new r.Pointer(r.uint16, ChainRuleSet), 'chainCount')
  },

  2: { // Class-based chaining context
    coverage: new r.Pointer(r.uint16, Coverage),
    backtrackClassDef: new r.Pointer(r.uint16, ClassDef),
    inputClassDef: new r.Pointer(r.uint16, ClassDef),
    lookaheadClassDef: new r.Pointer(r.uint16, ClassDef),
    chainCount: r.uint16,
    chainClassSet: new r.Array(new r.Pointer(r.uint16, ChainRuleSet), 'chainCount')
  },

  3: { // Coverage-based chaining context
    backtrackGlyphCount: r.uint16,
    backtrackCoverage: new r.Array(new r.Pointer(r.uint16, Coverage), 'backtrackGlyphCount'),
    inputGlyphCount: r.uint16,
    inputCoverage: new r.Array(new r.Pointer(r.uint16, Coverage), 'inputGlyphCount'),
    lookaheadGlyphCount: r.uint16,
    lookaheadCoverage: new r.Array(new r.Pointer(r.uint16, Coverage), 'lookaheadGlyphCount'),
    lookupCount: r.uint16,
    lookupRecords: new r.Array(LookupRecord, 'lookupCount')
  }
});

var BaseCoord = new r.VersionedStruct(r.uint16, {
  1: { // Design units only
    coordinate: r.int16 // X or Y value, in design units
  },

  2: { // Design units plus contour point
    coordinate: r.int16, // X or Y value, in design units
    referenceGlyph: r.uint16, // GlyphID of control glyph
    baseCoordPoint: r.uint16 // Index of contour point on the referenceGlyph
  },

  3: { // Design units plus Device table
    coordinate: r.int16, // X or Y value, in design units
    deviceTable: new r.Pointer(r.uint16, Device) // Device table for X or Y value
  }
});

var BaseValues = new r.Struct({
  defaultIndex: r.uint16, // Index of default baseline for this script-same index in the BaseTagList
  baseCoordCount: r.uint16,
  baseCoords: new r.Array(new r.Pointer(r.uint16, BaseCoord), 'baseCoordCount')
});

var FeatMinMaxRecord = new r.Struct({
  tag: new r.String(4), // 4-byte feature identification tag-must match FeatureTag in FeatureList
  minCoord: new r.Pointer(r.uint16, BaseCoord, { type: 'parent' }), // May be NULL
  maxCoord: new r.Pointer(r.uint16, BaseCoord, { type: 'parent' }) // May be NULL
});

var MinMax = new r.Struct({
  minCoord: new r.Pointer(r.uint16, BaseCoord), // May be NULL
  maxCoord: new r.Pointer(r.uint16, BaseCoord), // May be NULL
  featMinMaxCount: r.uint16, // May be 0
  featMinMaxRecords: new r.Array(FeatMinMaxRecord, 'featMinMaxCount') // In alphabetical order
});

var BaseLangSysRecord = new r.Struct({
  tag: new r.String(4), // 4-byte language system identification tag
  minMax: new r.Pointer(r.uint16, MinMax, { type: 'parent' })
});

var BaseScript = new r.Struct({
  baseValues: new r.Pointer(r.uint16, BaseValues), // May be NULL
  defaultMinMax: new r.Pointer(r.uint16, MinMax), // May be NULL
  baseLangSysCount: r.uint16, // May be 0
  baseLangSysRecords: new r.Array(BaseLangSysRecord, 'baseLangSysCount') // in alphabetical order by BaseLangSysTag
});

var BaseScriptRecord = new r.Struct({
  tag: new r.String(4), // 4-byte script identification tag
  script: new r.Pointer(r.uint16, BaseScript, { type: 'parent' })
});

var BaseScriptList = new r.Array(BaseScriptRecord, r.uint16);

// Array of 4-byte baseline identification tags-must be in alphabetical order
var BaseTagList = new r.Array(new r.String(4), r.uint16);

var Axis = new r.Struct({
  baseTagList: new r.Pointer(r.uint16, BaseTagList), // May be NULL
  baseScriptList: new r.Pointer(r.uint16, BaseScriptList)
});

var BASE = new r.Struct({
  version: r.uint32, // Version of the BASE table-initially 0x00010000
  horizAxis: new r.Pointer(r.uint16, Axis), // May be NULL
  vertAxis: new r.Pointer(r.uint16, Axis) // May be NULL
});

var AttachPoint = new r.Array(r.uint16, r.uint16);
var AttachList = new r.Struct({
  coverage: new r.Pointer(r.uint16, Coverage),
  glyphCount: r.uint16,
  attachPoints: new r.Array(new r.Pointer(r.uint16, AttachPoint), 'glyphCount')
});

var CaretValue = new r.VersionedStruct(r.uint16, {
  1: { // Design units only
    coordinate: r.int16
  },

  2: { // Contour point
    caretValuePoint: r.uint16
  },

  3: { // Design units plus Device table
    coordinate: r.int16,
    deviceTable: new r.Pointer(r.uint16, Device)
  }
});

var LigGlyph = new r.Array(new r.Pointer(r.uint16, CaretValue), r.uint16);

var LigCaretList = new r.Struct({
  coverage: new r.Pointer(r.uint16, Coverage),
  ligGlyphCount: r.uint16,
  ligGlyphs: new r.Array(new r.Pointer(r.uint16, LigGlyph), 'ligGlyphCount')
});

var MarkGlyphSetsDef = new r.Struct({
  markSetTableFormat: r.uint16,
  markSetCount: r.uint16,
  coverage: new r.Array(new r.Pointer(r.uint32, Coverage), 'markSetCount')
});

var GDEF = new r.VersionedStruct(r.uint32, {
  0x00010000: {
    glyphClassDef: new r.Pointer(r.uint16, ClassDef), // 1: base glyph, 2: ligature, 3: mark, 4: component
    attachList: new r.Pointer(r.uint16, AttachList),
    ligCaretList: new r.Pointer(r.uint16, LigCaretList),
    markAttachClassDef: new r.Pointer(r.uint16, ClassDef)
  },
  0x00010002: {
    glyphClassDef: new r.Pointer(r.uint16, ClassDef),
    attachList: new r.Pointer(r.uint16, AttachList),
    ligCaretList: new r.Pointer(r.uint16, LigCaretList),
    markAttachClassDef: new r.Pointer(r.uint16, ClassDef),
    markGlyphSetsDef: new r.Pointer(r.uint16, MarkGlyphSetsDef)
  }
});

var ValueFormat = new r.Bitfield(r.uint16, ['xPlacement', 'yPlacement', 'xAdvance', 'yAdvance', 'xPlaDevice', 'yPlaDevice', 'xAdvDevice', 'yAdvDevice']);

var types = {
  xPlacement: r.int16,
  yPlacement: r.int16,
  xAdvance: r.int16,
  yAdvance: r.int16,
  xPlaDevice: new r.Pointer(r.uint16, Device, { type: 'global', relativeTo: 'rel' }),
  yPlaDevice: new r.Pointer(r.uint16, Device, { type: 'global', relativeTo: 'rel' }),
  xAdvDevice: new r.Pointer(r.uint16, Device, { type: 'global', relativeTo: 'rel' }),
  yAdvDevice: new r.Pointer(r.uint16, Device, { type: 'global', relativeTo: 'rel' })
};

var ValueRecord = function () {
  function ValueRecord() {
    var key = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'valueFormat';

    _classCallCheck(this, ValueRecord);

    this.key = key;
  }

  _createClass(ValueRecord, [{
    key: 'buildStruct',
    value: function buildStruct(parent) {
      var struct = parent;
      while (!struct[this.key] && struct.parent) {
        struct = struct.parent;
      }

      if (!struct[this.key]) return;

      var fields = {};
      fields.rel = function () {
        return struct._startOffset;
      };

      var format = struct[this.key];
      for (var key in format) {
        if (format[key]) {
          fields[key] = types[key];
        }
      }

      return new r.Struct(fields);
    }
  }, {
    key: 'size',
    value: function size(val, ctx) {
      return this.buildStruct(ctx).size(val, ctx);
    }
  }, {
    key: 'decode',
    value: function decode(stream, parent) {
      var res = this.buildStruct(parent).decode(stream, parent);
      delete res.rel;
      return res;
    }
  }]);

  return ValueRecord;
}();

var PairValueRecord = new r.Struct({
  secondGlyph: r.uint16,
  value1: new ValueRecord('valueFormat1'),
  value2: new ValueRecord('valueFormat2')
});

var PairSet = new r.Array(PairValueRecord, r.uint16);

var Class2Record = new r.Struct({
  value1: new ValueRecord('valueFormat1'),
  value2: new ValueRecord('valueFormat2')
});

var Anchor = new r.VersionedStruct(r.uint16, {
  1: { // Design units only
    xCoordinate: r.int16,
    yCoordinate: r.int16
  },

  2: { // Design units plus contour point
    xCoordinate: r.int16,
    yCoordinate: r.int16,
    anchorPoint: r.uint16
  },

  3: { // Design units plus Device tables
    xCoordinate: r.int16,
    yCoordinate: r.int16,
    xDeviceTable: new r.Pointer(r.uint16, Device),
    yDeviceTable: new r.Pointer(r.uint16, Device)
  }
});

var EntryExitRecord = new r.Struct({
  entryAnchor: new r.Pointer(r.uint16, Anchor, { type: 'parent' }),
  exitAnchor: new r.Pointer(r.uint16, Anchor, { type: 'parent' })
});

var MarkRecord = new r.Struct({
  class: r.uint16,
  markAnchor: new r.Pointer(r.uint16, Anchor, { type: 'parent' })
});

var MarkArray = new r.Array(MarkRecord, r.uint16);

var BaseRecord = new r.Array(new r.Pointer(r.uint16, Anchor), function (t) {
  return t.parent.classCount;
});
var BaseArray = new r.Array(BaseRecord, r.uint16);

var ComponentRecord = new r.Array(new r.Pointer(r.uint16, Anchor), function (t) {
  return t.parent.parent.classCount;
});
var LigatureAttach = new r.Array(ComponentRecord, r.uint16);
var LigatureArray = new r.Array(new r.Pointer(r.uint16, LigatureAttach), r.uint16);

var GPOSLookup = new r.VersionedStruct('lookupType', {
  1: new r.VersionedStruct(r.uint16, { // Single Adjustment
    1: { // Single positioning value
      coverage: new r.Pointer(r.uint16, Coverage),
      valueFormat: ValueFormat,
      value: new ValueRecord()
    },
    2: {
      coverage: new r.Pointer(r.uint16, Coverage),
      valueFormat: ValueFormat,
      valueCount: r.uint16,
      values: new r.LazyArray(new ValueRecord(), 'valueCount')
    }
  }),

  2: new r.VersionedStruct(r.uint16, { // Pair Adjustment Positioning
    1: { // Adjustments for glyph pairs
      coverage: new r.Pointer(r.uint16, Coverage),
      valueFormat1: ValueFormat,
      valueFormat2: ValueFormat,
      pairSetCount: r.uint16,
      pairSets: new r.LazyArray(new r.Pointer(r.uint16, PairSet), 'pairSetCount')
    },

    2: { // Class pair adjustment
      coverage: new r.Pointer(r.uint16, Coverage),
      valueFormat1: ValueFormat,
      valueFormat2: ValueFormat,
      classDef1: new r.Pointer(r.uint16, ClassDef),
      classDef2: new r.Pointer(r.uint16, ClassDef),
      class1Count: r.uint16,
      class2Count: r.uint16,
      classRecords: new r.LazyArray(new r.LazyArray(Class2Record, 'class2Count'), 'class1Count')
    }
  }),

  3: { // Cursive Attachment Positioning
    format: r.uint16,
    coverage: new r.Pointer(r.uint16, Coverage),
    entryExitCount: r.uint16,
    entryExitRecords: new r.Array(EntryExitRecord, 'entryExitCount')
  },

  4: { // MarkToBase Attachment Positioning
    format: r.uint16,
    markCoverage: new r.Pointer(r.uint16, Coverage),
    baseCoverage: new r.Pointer(r.uint16, Coverage),
    classCount: r.uint16,
    markArray: new r.Pointer(r.uint16, MarkArray),
    baseArray: new r.Pointer(r.uint16, BaseArray)
  },

  5: { // MarkToLigature Attachment Positioning
    format: r.uint16,
    markCoverage: new r.Pointer(r.uint16, Coverage),
    ligatureCoverage: new r.Pointer(r.uint16, Coverage),
    classCount: r.uint16,
    markArray: new r.Pointer(r.uint16, MarkArray),
    ligatureArray: new r.Pointer(r.uint16, LigatureArray)
  },

  6: { // MarkToMark Attachment Positioning
    format: r.uint16,
    mark1Coverage: new r.Pointer(r.uint16, Coverage),
    mark2Coverage: new r.Pointer(r.uint16, Coverage),
    classCount: r.uint16,
    mark1Array: new r.Pointer(r.uint16, MarkArray),
    mark2Array: new r.Pointer(r.uint16, BaseArray)
  },

  7: Context, // Contextual positioning
  8: ChainingContext, // Chaining contextual positioning

  9: { // Extension Positioning
    posFormat: r.uint16,
    lookupType: r.uint16, // cannot also be 9
    extension: new r.Pointer(r.uint32, GPOSLookup)
  }
});

// Fix circular reference
GPOSLookup.versions[9].extension.type = GPOSLookup;

var GPOS = new r.Struct({
  version: r.int32,
  scriptList: new r.Pointer(r.uint16, ScriptList),
  featureList: new r.Pointer(r.uint16, FeatureList),
  lookupList: new r.Pointer(r.uint16, new LookupList(GPOSLookup))
});

var Sequence = new r.Array(r.uint16, r.uint16);
var AlternateSet = Sequence;

var Ligature = new r.Struct({
  glyph: r.uint16,
  compCount: r.uint16,
  components: new r.Array(r.uint16, function (t) {
    return t.compCount - 1;
  })
});

var LigatureSet = new r.Array(new r.Pointer(r.uint16, Ligature), r.uint16);

var GSUBLookup = new r.VersionedStruct('lookupType', {
  1: new r.VersionedStruct(r.uint16, { // Single Substitution
    1: {
      coverage: new r.Pointer(r.uint16, Coverage),
      deltaGlyphID: r.int16
    },
    2: {
      coverage: new r.Pointer(r.uint16, Coverage),
      glyphCount: r.uint16,
      substitute: new r.LazyArray(r.uint16, 'glyphCount')
    }
  }),

  2: { // Multiple Substitution
    substFormat: r.uint16,
    coverage: new r.Pointer(r.uint16, Coverage),
    count: r.uint16,
    sequences: new r.LazyArray(new r.Pointer(r.uint16, Sequence), 'count')
  },

  3: { // Alternate Substitution
    substFormat: r.uint16,
    coverage: new r.Pointer(r.uint16, Coverage),
    count: r.uint16,
    alternateSet: new r.LazyArray(new r.Pointer(r.uint16, AlternateSet), 'count')
  },

  4: { // Ligature Substitution
    substFormat: r.uint16,
    coverage: new r.Pointer(r.uint16, Coverage),
    count: r.uint16,
    ligatureSets: new r.LazyArray(new r.Pointer(r.uint16, LigatureSet), 'count')
  },

  5: Context, // Contextual Substitution
  6: ChainingContext, // Chaining Contextual Substitution

  7: { // Extension Substitution
    substFormat: r.uint16,
    lookupType: r.uint16, // cannot also be 7
    extension: new r.Pointer(r.uint32, GSUBLookup)
  },

  8: { // Reverse Chaining Contextual Single Substitution
    substFormat: r.uint16,
    coverage: new r.Pointer(r.uint16, Coverage),
    backtrackCoverage: new r.Array(new r.Pointer(r.uint16, Coverage), 'backtrackGlyphCount'),
    lookaheadGlyphCount: r.uint16,
    lookaheadCoverage: new r.Array(new r.Pointer(r.uint16, Coverage), 'lookaheadGlyphCount'),
    glyphCount: r.uint16,
    substitutes: new r.Array(r.uint16, 'glyphCount')
  }
});

// Fix circular reference
GSUBLookup.versions[7].extension.type = GSUBLookup;

var GSUB = new r.Struct({
  version: r.int32,
  scriptList: new r.Pointer(r.uint16, ScriptList),
  featureList: new r.Pointer(r.uint16, FeatureList),
  lookupList: new r.Pointer(r.uint16, new LookupList(GSUBLookup))
});

var JstfGSUBModList = new r.Array(r.uint16, r.uint16);

var JstfPriority = new r.Struct({
  shrinkageEnableGSUB: new r.Pointer(r.uint16, JstfGSUBModList),
  shrinkageDisableGSUB: new r.Pointer(r.uint16, JstfGSUBModList),
  shrinkageEnableGPOS: new r.Pointer(r.uint16, JstfGSUBModList),
  shrinkageDisableGPOS: new r.Pointer(r.uint16, JstfGSUBModList),
  shrinkageJstfMax: new r.Pointer(r.uint16, new LookupList(GPOSLookup)),
  extensionEnableGSUB: new r.Pointer(r.uint16, JstfGSUBModList),
  extensionDisableGSUB: new r.Pointer(r.uint16, JstfGSUBModList),
  extensionEnableGPOS: new r.Pointer(r.uint16, JstfGSUBModList),
  extensionDisableGPOS: new r.Pointer(r.uint16, JstfGSUBModList),
  extensionJstfMax: new r.Pointer(r.uint16, new LookupList(GPOSLookup))
});

var JstfLangSys = new r.Array(new r.Pointer(r.uint16, JstfPriority), r.uint16);

var JstfLangSysRecord = new r.Struct({
  tag: new r.String(4),
  jstfLangSys: new r.Pointer(r.uint16, JstfLangSys)
});

var JstfScript = new r.Struct({
  extenderGlyphs: new r.Pointer(r.uint16, new r.Array(r.uint16, r.uint16)), // array of glyphs to extend line length
  defaultLangSys: new r.Pointer(r.uint16, JstfLangSys),
  langSysCount: r.uint16,
  langSysRecords: new r.Array(JstfLangSysRecord, 'langSysCount')
});

var JstfScriptRecord = new r.Struct({
  tag: new r.String(4),
  script: new r.Pointer(r.uint16, JstfScript, { type: 'parent' })
});

var JSTF = new r.Struct({
  version: r.uint32, // should be 0x00010000
  scriptCount: r.uint16,
  scriptList: new r.Array(JstfScriptRecord, 'scriptCount')
});

var Signature = new r.Struct({
  format: r.uint32,
  length: r.uint32,
  offset: r.uint32
});

var SignatureBlock = new r.Struct({
  reserved: new r.Reserved(r.uint16, 2),
  cbSignature: r.uint32, // Length (in bytes) of the PKCS#7 packet in pbSignature
  signature: new r.Buffer('cbSignature')
});

var DSIG = new r.Struct({
  ulVersion: r.uint32, // Version number of the DSIG table (0x00000001)
  usNumSigs: r.uint16, // Number of signatures in the table
  usFlag: r.uint16, // Permission flags
  signatures: new r.Array(Signature, 'usNumSigs'),
  signatureBlocks: new r.Array(SignatureBlock, 'usNumSigs')
});

var GaspRange = new r.Struct({
  rangeMaxPPEM: r.uint16, // Upper limit of range, in ppem
  rangeGaspBehavior: new r.Bitfield(r.uint16, [// Flags describing desired rasterizer behavior
  'grayscale', 'gridfit', 'symmetricSmoothing', 'symmetricGridfit' // only in version 1, for ClearType
  ])
});

var gasp = new r.Struct({
  version: r.uint16, // set to 0
  numRanges: r.uint16,
  gaspRanges: new r.Array(GaspRange, 'numRanges') // Sorted by ppem
});

var DeviceRecord = new r.Struct({
  pixelSize: r.uint8,
  maximumWidth: r.uint8,
  widths: new r.Array(r.uint8, function (t) {
    return t.parent.parent.maxp.numGlyphs;
  })
});

// The Horizontal Device Metrics table stores integer advance widths scaled to particular pixel sizes
var hdmx = new r.Struct({
  version: r.uint16,
  numRecords: r.int16,
  sizeDeviceRecord: r.int32,
  records: new r.Array(DeviceRecord, 'numRecords')
});

var KernPair = new r.Struct({
  left: r.uint16,
  right: r.uint16,
  value: r.int16
});

var ClassTable = new r.Struct({
  firstGlyph: r.uint16,
  nGlyphs: r.uint16,
  offsets: new r.Array(r.uint16, 'nGlyphs'),
  max: function max(t) {
    return t.offsets.length && Math.max.apply(Math, t.offsets);
  }
});

var Kern2Array = new r.Struct({
  off: function off(t) {
    return t._startOffset - t.parent.parent._startOffset;
  },
  len: function len(t) {
    return ((t.parent.leftTable.max - t.off) / t.parent.rowWidth + 1) * (t.parent.rowWidth / 2);
  },
  values: new r.LazyArray(r.int16, 'len')
});

var KernSubtable = new r.VersionedStruct('format', {
  0: {
    nPairs: r.uint16,
    searchRange: r.uint16,
    entrySelector: r.uint16,
    rangeShift: r.uint16,
    pairs: new r.Array(KernPair, 'nPairs')
  },

  2: {
    rowWidth: r.uint16,
    leftTable: new r.Pointer(r.uint16, ClassTable, { type: 'parent' }),
    rightTable: new r.Pointer(r.uint16, ClassTable, { type: 'parent' }),
    array: new r.Pointer(r.uint16, Kern2Array, { type: 'parent' })
  },

  3: {
    glyphCount: r.uint16,
    kernValueCount: r.uint8,
    leftClassCount: r.uint8,
    rightClassCount: r.uint8,
    flags: r.uint8,
    kernValue: new r.Array(r.int16, 'kernValueCount'),
    leftClass: new r.Array(r.uint8, 'glyphCount'),
    rightClass: new r.Array(r.uint8, 'glyphCount'),
    kernIndex: new r.Array(r.uint8, function (t) {
      return t.leftClassCount * t.rightClassCount;
    })
  }
});

var KernTable = new r.VersionedStruct('version', {
  0: { // Microsoft uses this format
    subVersion: r.uint16, // Microsoft has an extra sub-table version number
    length: r.uint16, // Length of the subtable, in bytes
    format: r.uint8, // Format of subtable
    coverage: new r.Bitfield(r.uint8, ['horizontal', // 1 if table has horizontal data, 0 if vertical
    'minimum', // If set to 1, the table has minimum values. If set to 0, the table has kerning values.
    'crossStream', // If set to 1, kerning is perpendicular to the flow of the text
    'override' // If set to 1 the value in this table replaces the accumulated value
    ]),
    subtable: KernSubtable,
    padding: new r.Reserved(r.uint8, function (t) {
      return t.length - t._currentOffset;
    })
  },
  1: { // Apple uses this format
    length: r.uint32,
    coverage: new r.Bitfield(r.uint8, [null, null, null, null, null, 'variation', // Set if table has variation kerning values
    'crossStream', // Set if table has cross-stream kerning values
    'vertical' // Set if table has vertical kerning values
    ]),
    format: r.uint8,
    tupleIndex: r.uint16,
    subtable: KernSubtable,
    padding: new r.Reserved(r.uint8, function (t) {
      return t.length - t._currentOffset;
    })
  }
});

var kern = new r.VersionedStruct(r.uint16, {
  0: { // Microsoft Version
    nTables: r.uint16,
    tables: new r.Array(KernTable, 'nTables')
  },

  1: { // Apple Version
    reserved: new r.Reserved(r.uint16), // the other half of the version number
    nTables: r.uint32,
    tables: new r.Array(KernTable, 'nTables')
  }
});

// Linear Threshold table
// Records the ppem for each glyph at which the scaling becomes linear again,
// despite instructions effecting the advance width
var LTSH = new r.Struct({
  version: r.uint16,
  numGlyphs: r.uint16,
  yPels: new r.Array(r.uint8, 'numGlyphs')
});

// PCL 5 Table
// NOTE: The PCLT table is strongly discouraged for OpenType fonts with TrueType outlines
var PCLT = new r.Struct({
  version: r.uint16,
  fontNumber: r.uint32,
  pitch: r.uint16,
  xHeight: r.uint16,
  style: r.uint16,
  typeFamily: r.uint16,
  capHeight: r.uint16,
  symbolSet: r.uint16,
  typeface: new r.String(16),
  characterComplement: new r.String(8),
  fileName: new r.String(6),
  strokeWeight: new r.String(1),
  widthType: new r.String(1),
  serifStyle: r.uint8,
  reserved: new r.Reserved(r.uint8)
});

// VDMX tables contain ascender/descender overrides for certain (usually small)
// sizes. This is needed in order to match font metrics on Windows.

var Ratio = new r.Struct({
  bCharSet: r.uint8, // Character set
  xRatio: r.uint8, // Value to use for x-Ratio
  yStartRatio: r.uint8, // Starting y-Ratio value
  yEndRatio: r.uint8 // Ending y-Ratio value
});

var vTable = new r.Struct({
  yPelHeight: r.uint16, // yPelHeight to which values apply
  yMax: r.int16, // Maximum value (in pels) for this yPelHeight
  yMin: r.int16 // Minimum value (in pels) for this yPelHeight
});

var VdmxGroup = new r.Struct({
  recs: r.uint16, // Number of height records in this group
  startsz: r.uint8, // Starting yPelHeight
  endsz: r.uint8, // Ending yPelHeight
  entries: new r.Array(vTable, 'recs') // The VDMX records
});

var VDMX = new r.Struct({
  version: r.uint16, // Version number (0 or 1)
  numRecs: r.uint16, // Number of VDMX groups present
  numRatios: r.uint16, // Number of aspect ratio groupings
  ratioRanges: new r.Array(Ratio, 'numRatios'), // Ratio ranges
  offsets: new r.Array(r.uint16, 'numRatios'), // Offset to the VDMX group for this ratio range
  groups: new r.Array(VdmxGroup, 'numRecs') // The actual VDMX groupings
});

// Vertical Header Table
var vhea = new r.Struct({
  version: r.uint16, // Version number of the Vertical Header Table
  ascent: r.int16, // The vertical typographic ascender for this font
  descent: r.int16, // The vertical typographic descender for this font
  lineGap: r.int16, // The vertical typographic line gap for this font
  advanceHeightMax: r.int16, // The maximum advance height measurement found in the font
  minTopSideBearing: r.int16, // The minimum top side bearing measurement found in the font
  minBottomSideBearing: r.int16, // The minimum bottom side bearing measurement found in the font
  yMaxExtent: r.int16,
  caretSlopeRise: r.int16, // Caret slope (rise/run)
  caretSlopeRun: r.int16,
  caretOffset: r.int16, // Set value equal to 0 for nonslanted fonts
  reserved: new r.Reserved(r.int16, 4),
  metricDataFormat: r.int16, // Set to 0
  numberOfMetrics: r.uint16 // Number of advance heights in the Vertical Metrics table
});

var VmtxEntry = new r.Struct({
  advance: r.uint16, // The advance height of the glyph
  bearing: r.int16 // The top sidebearing of the glyph
});

// Vertical Metrics Table
var vmtx = new r.Struct({
  metrics: new r.LazyArray(VmtxEntry, function (t) {
    return t.parent.vhea.numberOfMetrics;
  }),
  bearings: new r.LazyArray(r.int16, function (t) {
    return t.parent.maxp.numGlyphs - t.parent.vhea.numberOfMetrics;
  })
});

var shortFrac = new r.Fixed(16, 'BE', 14);

var Correspondence = new r.Struct({
  fromCoord: shortFrac,
  toCoord: shortFrac
});

var Segment = new r.Struct({
  pairCount: r.uint16,
  correspondence: new r.Array(Correspondence, 'pairCount')
});

var avar = new r.Struct({
  version: r.fixed32,
  axisCount: r.uint32,
  segment: new r.Array(Segment, 'axisCount')
});

var UnboundedArrayAccessor = function () {
  function UnboundedArrayAccessor(type, stream, parent) {
    _classCallCheck(this, UnboundedArrayAccessor);

    this.type = type;
    this.stream = stream;
    this.parent = parent;
    this.base = this.stream.pos;
    this._items = [];
  }

  _createClass(UnboundedArrayAccessor, [{
    key: 'getItem',
    value: function getItem(index) {
      if (this._items[index] == null) {
        var pos = this.stream.pos;
        this.stream.pos = this.base + this.type.size(null, this.parent) * index;
        this._items[index] = this.type.decode(this.stream, this.parent);
        this.stream.pos = pos;
      }

      return this._items[index];
    }
  }, {
    key: 'inspect',
    value: function inspect() {
      return '[UnboundedArray ' + this.type.constructor.name + ']';
    }
  }]);

  return UnboundedArrayAccessor;
}();

var UnboundedArray = function (_r$Array) {
  _inherits(UnboundedArray, _r$Array);

  function UnboundedArray(type) {
    _classCallCheck(this, UnboundedArray);

    return _possibleConstructorReturn(this, (UnboundedArray.__proto__ || _Object$getPrototypeOf(UnboundedArray)).call(this, type, 0));
  }

  _createClass(UnboundedArray, [{
    key: 'decode',
    value: function decode(stream, parent) {
      return new UnboundedArrayAccessor(this.type, stream, parent);
    }
  }]);

  return UnboundedArray;
}(r.Array);

var LookupTable = function LookupTable() {
  var ValueType = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : r.uint16;

  // Helper class that makes internal structures invisible to pointers
  var Shadow = function () {
    function Shadow(type) {
      _classCallCheck(this, Shadow);

      this.type = type;
    }

    _createClass(Shadow, [{
      key: 'decode',
      value: function decode(stream, ctx) {
        ctx = ctx.parent.parent;
        return this.type.decode(stream, ctx);
      }
    }, {
      key: 'size',
      value: function size(val, ctx) {
        ctx = ctx.parent.parent;
        return this.type.size(val, ctx);
      }
    }, {
      key: 'encode',
      value: function encode(stream, val, ctx) {
        ctx = ctx.parent.parent;
        return this.type.encode(stream, val, ctx);
      }
    }]);

    return Shadow;
  }();

  ValueType = new Shadow(ValueType);

  var BinarySearchHeader = new r.Struct({
    unitSize: r.uint16,
    nUnits: r.uint16,
    searchRange: r.uint16,
    entrySelector: r.uint16,
    rangeShift: r.uint16
  });

  var LookupSegmentSingle = new r.Struct({
    lastGlyph: r.uint16,
    firstGlyph: r.uint16,
    value: ValueType
  });

  var LookupSegmentArray = new r.Struct({
    lastGlyph: r.uint16,
    firstGlyph: r.uint16,
    values: new r.Pointer(r.uint16, new r.Array(ValueType, function (t) {
      return t.lastGlyph - t.firstGlyph + 1;
    }), { type: 'parent' })
  });

  var LookupSingle = new r.Struct({
    glyph: r.uint16,
    value: ValueType
  });

  return new r.VersionedStruct(r.uint16, {
    0: {
      values: new UnboundedArray(ValueType) // length == number of glyphs maybe?
    },
    2: {
      binarySearchHeader: BinarySearchHeader,
      segments: new r.Array(LookupSegmentSingle, function (t) {
        return t.binarySearchHeader.nUnits;
      })
    },
    4: {
      binarySearchHeader: BinarySearchHeader,
      segments: new r.Array(LookupSegmentArray, function (t) {
        return t.binarySearchHeader.nUnits;
      })
    },
    6: {
      binarySearchHeader: BinarySearchHeader,
      segments: new r.Array(LookupSingle, function (t) {
        return t.binarySearchHeader.nUnits;
      })
    },
    8: {
      firstGlyph: r.uint16,
      count: r.uint16,
      values: new r.Array(ValueType, 'count')
    }
  });
};

function StateTable() {
  var entryData = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var lookupType = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : r.uint16;

  var entry = _Object$assign({
    newState: r.uint16,
    flags: r.uint16
  }, entryData);

  var Entry = new r.Struct(entry);
  var StateArray = new UnboundedArray(new r.Array(r.uint16, function (t) {
    return t.nClasses;
  }));

  var StateHeader = new r.Struct({
    nClasses: r.uint32,
    classTable: new r.Pointer(r.uint32, new LookupTable(lookupType)),
    stateArray: new r.Pointer(r.uint32, StateArray),
    entryTable: new r.Pointer(r.uint32, new UnboundedArray(Entry))
  });

  return StateHeader;
}

// This is the old version of the StateTable structure
function StateTable1() {
  var entryData = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var lookupType = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : r.uint16;

  var ClassLookupTable = new r.Struct({
    version: function version() {
      return 8;
    },
    // simulate LookupTable
    firstGlyph: r.uint16,
    values: new r.Array(r.uint8, r.uint16)
  });

  var entry = _Object$assign({
    newStateOffset: r.uint16,
    // convert offset to stateArray index
    newState: function newState(t) {
      return (t.newStateOffset - (t.parent.stateArray.base - t.parent._startOffset)) / t.parent.nClasses;
    },
    flags: r.uint16
  }, entryData);

  var Entry = new r.Struct(entry);
  var StateArray = new UnboundedArray(new r.Array(r.uint8, function (t) {
    return t.nClasses;
  }));

  var StateHeader1 = new r.Struct({
    nClasses: r.uint16,
    classTable: new r.Pointer(r.uint16, ClassLookupTable),
    stateArray: new r.Pointer(r.uint16, StateArray),
    entryTable: new r.Pointer(r.uint16, new UnboundedArray(Entry))
  });

  return StateHeader1;
}

var BslnSubtable = new r.VersionedStruct('format', {
  0: { // Distance-based, no mapping
    deltas: new r.Array(r.int16, 32)
  },

  1: { // Distance-based, with mapping
    deltas: new r.Array(r.int16, 32),
    mappingData: new LookupTable(r.uint16)
  },

  2: { // Control point-based, no mapping
    standardGlyph: r.uint16,
    controlPoints: new r.Array(r.uint16, 32)
  },

  3: { // Control point-based, with mapping
    standardGlyph: r.uint16,
    controlPoints: new r.Array(r.uint16, 32),
    mappingData: new LookupTable(r.uint16)
  }
});

var bsln = new r.Struct({
  version: r.fixed32,
  format: r.uint16,
  defaultBaseline: r.uint16,
  subtable: BslnSubtable
});

var Setting = new r.Struct({
  setting: r.uint16,
  nameIndex: r.int16,
  name: function name(t) {
    return t.parent.parent.parent.name.records.fontFeatures[t.nameIndex];
  }
});

var FeatureName = new r.Struct({
  feature: r.uint16,
  nSettings: r.uint16,
  settingTable: new r.Pointer(r.uint32, new r.Array(Setting, 'nSettings'), { type: 'parent' }),
  featureFlags: new r.Bitfield(r.uint8, [null, null, null, null, null, null, 'hasDefault', 'exclusive']),
  defaultSetting: r.uint8,
  nameIndex: r.int16,
  name: function name(t) {
    return t.parent.parent.name.records.fontFeatures[t.nameIndex];
  }
});

var feat = new r.Struct({
  version: r.fixed32,
  featureNameCount: r.uint16,
  reserved1: new r.Reserved(r.uint16),
  reserved2: new r.Reserved(r.uint32),
  featureNames: new r.Array(FeatureName, 'featureNameCount')
});

var Axis$1 = new r.Struct({
  axisTag: new r.String(4),
  minValue: r.fixed32,
  defaultValue: r.fixed32,
  maxValue: r.fixed32,
  flags: r.uint16,
  nameID: r.uint16,
  name: function name(t) {
    return t.parent.parent.name.records.fontFeatures[t.nameID];
  }
});

var Instance = new r.Struct({
  nameID: r.uint16,
  name: function name(t) {
    return t.parent.parent.name.records.fontFeatures[t.nameID];
  },
  flags: r.uint16,
  coord: new r.Array(r.fixed32, function (t) {
    return t.parent.axisCount;
  })
});

var fvar = new r.Struct({
  version: r.fixed32,
  offsetToData: r.uint16,
  countSizePairs: r.uint16,
  axisCount: r.uint16,
  axisSize: r.uint16,
  instanceCount: r.uint16,
  instanceSize: r.uint16,
  axis: new r.Array(Axis$1, 'axisCount'),
  instance: new r.Array(Instance, 'instanceCount')
});

var shortFrac$1 = new r.Fixed(16, 'BE', 14);

var Offset = function () {
  function Offset() {
    _classCallCheck(this, Offset);
  }

  _createClass(Offset, null, [{
    key: 'decode',
    value: function decode(stream, parent) {
      // In short format, offsets are multiplied by 2.
      // This doesn't seem to be documented by Apple, but it
      // is implemented this way in Freetype.
      return parent.flags ? stream.readUInt32BE() : stream.readUInt16BE() * 2;
    }
  }]);

  return Offset;
}();

var gvar = new r.Struct({
  version: r.uint16,
  reserved: new r.Reserved(r.uint16),
  axisCount: r.uint16,
  globalCoordCount: r.uint16,
  globalCoords: new r.Pointer(r.uint32, new r.Array(new r.Array(shortFrac$1, 'axisCount'), 'globalCoordCount')),
  glyphCount: r.uint16,
  flags: r.uint16,
  offsetToData: r.uint32,
  offsets: new r.Array(new r.Pointer(Offset, 'void', { relativeTo: 'offsetToData', allowNull: false }), function (t) {
    return t.glyphCount + 1;
  })
});

var ClassTable$1 = new r.Struct({
  length: r.uint16,
  coverage: r.uint16,
  subFeatureFlags: r.uint32,
  stateTable: new StateTable1()
});

var WidthDeltaRecord = new r.Struct({
  justClass: r.uint32,
  beforeGrowLimit: r.fixed32,
  beforeShrinkLimit: r.fixed32,
  afterGrowLimit: r.fixed32,
  afterShrinkLimit: r.fixed32,
  growFlags: r.uint16,
  shrinkFlags: r.uint16
});

var WidthDeltaCluster = new r.Array(WidthDeltaRecord, r.uint32);

var ActionData = new r.VersionedStruct('actionType', {
  0: { // Decomposition action
    lowerLimit: r.fixed32,
    upperLimit: r.fixed32,
    order: r.uint16,
    glyphs: new r.Array(r.uint16, r.uint16)
  },

  1: { // Unconditional add glyph action
    addGlyph: r.uint16
  },

  2: { // Conditional add glyph action
    substThreshold: r.fixed32,
    addGlyph: r.uint16,
    substGlyph: r.uint16
  },

  3: {}, // Stretch glyph action (no data, not supported by CoreText)

  4: { // Ductile glyph action (not supported by CoreText)
    variationAxis: r.uint32,
    minimumLimit: r.fixed32,
    noStretchValue: r.fixed32,
    maximumLimit: r.fixed32
  },

  5: { // Repeated add glyph action
    flags: r.uint16,
    glyph: r.uint16
  }
});

var Action = new r.Struct({
  actionClass: r.uint16,
  actionType: r.uint16,
  actionLength: r.uint32,
  actionData: ActionData,
  padding: new r.Reserved(r.uint8, function (t) {
    return t.actionLength - t._currentOffset;
  })
});

var PostcompensationAction = new r.Array(Action, r.uint32);
var PostCompensationTable = new r.Struct({
  lookupTable: new LookupTable(new r.Pointer(r.uint16, PostcompensationAction))
});

var JustificationTable = new r.Struct({
  classTable: new r.Pointer(r.uint16, ClassTable$1, { type: 'parent' }),
  wdcOffset: r.uint16,
  postCompensationTable: new r.Pointer(r.uint16, PostCompensationTable, { type: 'parent' }),
  widthDeltaClusters: new LookupTable(new r.Pointer(r.uint16, WidthDeltaCluster, { type: 'parent', relativeTo: 'wdcOffset' }))
});

var just = new r.Struct({
  version: r.uint32,
  format: r.uint16,
  horizontal: new r.Pointer(r.uint16, JustificationTable),
  vertical: new r.Pointer(r.uint16, JustificationTable)
});

var LigatureData = {
  action: r.uint16
};

var ContextualData = {
  markIndex: r.uint16,
  currentIndex: r.uint16
};

var InsertionData = {
  currentInsertIndex: r.uint16,
  markedInsertIndex: r.uint16
};

var SubstitutionTable = new r.Struct({
  items: new UnboundedArray(new r.Pointer(r.uint32, new LookupTable()))
});

var SubtableData = new r.VersionedStruct('type', {
  0: { // Indic Rearrangement Subtable
    stateTable: new StateTable()
  },

  1: { // Contextual Glyph Substitution Subtable
    stateTable: new StateTable(ContextualData),
    substitutionTable: new r.Pointer(r.uint32, SubstitutionTable)
  },

  2: { // Ligature subtable
    stateTable: new StateTable(LigatureData),
    ligatureActions: new r.Pointer(r.uint32, new UnboundedArray(r.uint32)),
    components: new r.Pointer(r.uint32, new UnboundedArray(r.uint16)),
    ligatureList: new r.Pointer(r.uint32, new UnboundedArray(r.uint16))
  },

  4: { // Non-contextual Glyph Substitution Subtable
    lookupTable: new LookupTable()
  },

  5: { // Glyph Insertion Subtable
    stateTable: new StateTable(InsertionData),
    insertionActions: new r.Pointer(r.uint32, new UnboundedArray(r.uint16))
  }
});

var Subtable = new r.Struct({
  length: r.uint32,
  coverage: r.uint24,
  type: r.uint8,
  subFeatureFlags: r.uint32,
  table: SubtableData,
  padding: new r.Reserved(r.uint8, function (t) {
    return t.length - t._currentOffset;
  })
});

var FeatureEntry = new r.Struct({
  featureType: r.uint16,
  featureSetting: r.uint16,
  enableFlags: r.uint32,
  disableFlags: r.uint32
});

var MorxChain = new r.Struct({
  defaultFlags: r.uint32,
  chainLength: r.uint32,
  nFeatureEntries: r.uint32,
  nSubtables: r.uint32,
  features: new r.Array(FeatureEntry, 'nFeatureEntries'),
  subtables: new r.Array(Subtable, 'nSubtables')
});

var morx = new r.Struct({
  version: r.uint16,
  unused: new r.Reserved(r.uint16),
  nChains: r.uint32,
  chains: new r.Array(MorxChain, 'nChains')
});

var OpticalBounds = new r.Struct({
  left: r.int16,
  top: r.int16,
  right: r.int16,
  bottom: r.int16
});

var opbd = new r.Struct({
  version: r.fixed32,
  format: r.uint16,
  lookupTable: new LookupTable(OpticalBounds)
});

var tables = {};
// Required Tables
tables.cmap = cmap;
tables.head = head;
tables.hhea = hhea;
tables.hmtx = hmtx;
tables.maxp = maxp;
tables.name = NameTable;
tables['OS/2'] = OS2;
tables.post = post;

// TrueType Outlines
tables.fpgm = fpgm;
tables.loca = loca;
tables.prep = prep;
tables['cvt '] = cvt;
tables.glyf = glyf;

// PostScript Outlines
tables['CFF '] = CFFFont;
tables.VORG = VORG;

// Bitmap Glyphs
tables.EBLC = EBLC;
tables.CBLC = tables.EBLC;
tables.sbix = sbix;
tables.COLR = COLR;
tables.CPAL = CPAL;

// Advanced OpenType Tables
tables.BASE = BASE;
tables.GDEF = GDEF;
tables.GPOS = GPOS;
tables.GSUB = GSUB;
tables.JSTF = JSTF;

// Other OpenType Tables
tables.DSIG = DSIG;
tables.gasp = gasp;
tables.hdmx = hdmx;
tables.kern = kern;
tables.LTSH = LTSH;
tables.PCLT = PCLT;
tables.VDMX = VDMX;
tables.vhea = vhea;
tables.vmtx = vmtx;

// Apple Advanced Typography Tables
tables.avar = avar;
tables.bsln = bsln;
tables.feat = feat;
tables.fvar = fvar;
tables.gvar = gvar;
tables.just = just;
tables.morx = morx;
tables.opbd = opbd;

var TableEntry = new r.Struct({
  tag: new r.String(4),
  checkSum: r.uint32,
  offset: new r.Pointer(r.uint32, 'void', { type: 'global' }),
  length: r.uint32
});

var Directory = new r.Struct({
  tag: new r.String(4),
  numTables: r.uint16,
  searchRange: r.uint16,
  entrySelector: r.uint16,
  rangeShift: r.uint16,
  tables: new r.Array(TableEntry, 'numTables')
});

Directory.process = function () {
  var tables = {};
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = _getIterator(this.tables), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var table = _step.value;

      tables[table.tag] = table;
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  this.tables = tables;
};

Directory.preEncode = function (stream) {
  var tables$$ = [];
  for (var tag in this.tables) {
    var table = this.tables[tag];
    if (table) {
      tables$$.push({
        tag: tag,
        checkSum: 0,
        offset: new r.VoidPointer(tables[tag], table),
        length: tables[tag].size(table)
      });
    }
  }

  this.tag = 'true';
  this.numTables = tables$$.length;
  this.tables = tables$$;

  this.searchRange = Math.floor(Math.log(this.numTables) / Math.LN2) * 16;
  this.entrySelector = Math.floor(this.searchRange / Math.LN2);
  this.rangeShift = this.numTables * 16 - this.searchRange;
};

function binarySearch(arr, cmp) {
  var min = 0;
  var max = arr.length - 1;
  while (min <= max) {
    var mid = min + max >> 1;
    var res = cmp(arr[mid]);

    if (res < 0) {
      max = mid - 1;
    } else if (res > 0) {
      min = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}

function range(index, end) {
  var range = [];
  while (index < end) {
    range.push(index++);
  }
  return range;
}

var _class$1;
function _applyDecoratedDescriptor$1(target, property, decorators, descriptor, context) {
  var desc = {};
  Object['ke' + 'ys'](descriptor).forEach(function (key) {
    desc[key] = descriptor[key];
  });
  desc.enumerable = !!desc.enumerable;
  desc.configurable = !!desc.configurable;

  if ('value' in desc || desc.initializer) {
    desc.writable = true;
  }

  desc = decorators.slice().reverse().reduce(function (desc, decorator) {
    return decorator(target, property, desc) || desc;
  }, desc);

  if (context && desc.initializer !== void 0) {
    desc.value = desc.initializer ? desc.initializer.call(context) : void 0;
    desc.initializer = undefined;
  }

  if (desc.initializer === void 0) {
    Object['define' + 'Property'](target, property, desc);
    desc = null;
  }

  return desc;
}

// iconv-lite is an optional dependency.
try {
  var iconv = require('iconv-lite');
} catch (err) {}

var CmapProcessor = (_class$1 = function () {
  function CmapProcessor(cmapTable) {
    _classCallCheck(this, CmapProcessor);

    // Attempt to find a Unicode cmap first
    this.encoding = null;
    this.cmap = this.findSubtable(cmapTable, [
    // 32-bit subtables
    [3, 10], [0, 6], [0, 4],

    // 16-bit subtables
    [3, 1], [0, 3], [0, 2], [0, 1], [0, 0], [3, 0]]);

    // If not unicode cmap was found, and iconv-lite is installed,
    // take the first table with a supported encoding.
    if (!this.cmap && iconv) {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(cmapTable.tables), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var cmap = _step.value;

          var encoding = getEncoding(cmap.platformID, cmap.encodingID, cmap.table.language - 1);
          if (iconv.encodingExists(encoding)) {
            this.cmap = cmap.table;
            this.encoding = encoding;
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }

    if (!this.cmap) {
      throw new Error("Could not find a supported cmap table");
    }

    this.uvs = this.findSubtable(cmapTable, [[0, 5]]);
    if (this.uvs && this.uvs.version !== 14) {
      this.uvs = null;
    }
  }

  _createClass(CmapProcessor, [{
    key: 'findSubtable',
    value: function findSubtable(cmapTable, pairs) {
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(pairs), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var _step2$value = _slicedToArray(_step2.value, 2),
              platformID = _step2$value[0],
              encodingID = _step2$value[1];

          var _iteratorNormalCompletion3 = true;
          var _didIteratorError3 = false;
          var _iteratorError3 = undefined;

          try {
            for (var _iterator3 = _getIterator(cmapTable.tables), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
              var cmap = _step3.value;

              if (cmap.platformID === platformID && cmap.encodingID === encodingID) {
                return cmap.table;
              }
            }
          } catch (err) {
            _didIteratorError3 = true;
            _iteratorError3 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion3 && _iterator3.return) {
                _iterator3.return();
              }
            } finally {
              if (_didIteratorError3) {
                throw _iteratorError3;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      return null;
    }
  }, {
    key: 'lookup',
    value: function lookup(codepoint, variationSelector) {
      // If there is no Unicode cmap in this font, we need to re-encode
      // the codepoint in the encoding that the cmap supports.
      if (this.encoding) {
        var buf = iconv.encode(_String$fromCodePoint(codepoint), this.encoding);
        codepoint = 0;
        for (var i = 0; i < buf.length; i++) {
          codepoint = codepoint << 8 | buf[i];
        }

        // Otherwise, try to get a Unicode variation selector for this codepoint if one is provided.
      } else if (variationSelector) {
        var gid = this.getVariationSelector(codepoint, variationSelector);
        if (gid) {
          return gid;
        }
      }

      var cmap = this.cmap;
      switch (cmap.version) {
        case 0:
          return cmap.codeMap.get(codepoint) || 0;

        case 4:
          {
            var min = 0;
            var max = cmap.segCount - 1;
            while (min <= max) {
              var mid = min + max >> 1;

              if (codepoint < cmap.startCode.get(mid)) {
                max = mid - 1;
              } else if (codepoint > cmap.endCode.get(mid)) {
                min = mid + 1;
              } else {
                var rangeOffset = cmap.idRangeOffset.get(mid);
                var _gid = void 0;

                if (rangeOffset === 0) {
                  _gid = codepoint + cmap.idDelta.get(mid);
                } else {
                  var index = rangeOffset / 2 + (codepoint - cmap.startCode.get(mid)) - (cmap.segCount - mid);
                  _gid = cmap.glyphIndexArray.get(index) || 0;
                  if (_gid !== 0) {
                    _gid += cmap.idDelta.get(mid);
                  }
                }

                return _gid & 0xffff;
              }
            }

            return 0;
          }

        case 8:
          throw new Error('TODO: cmap format 8');

        case 6:
        case 10:
          return cmap.glyphIndices.get(codepoint - cmap.firstCode) || 0;

        case 12:
        case 13:
          {
            var _min = 0;
            var _max = cmap.nGroups - 1;
            while (_min <= _max) {
              var _mid = _min + _max >> 1;
              var group = cmap.groups.get(_mid);

              if (codepoint < group.startCharCode) {
                _max = _mid - 1;
              } else if (codepoint > group.endCharCode) {
                _min = _mid + 1;
              } else {
                if (cmap.version === 12) {
                  return group.glyphID + (codepoint - group.startCharCode);
                } else {
                  return group.glyphID;
                }
              }
            }

            return 0;
          }

        case 14:
          throw new Error('TODO: cmap format 14');

        default:
          throw new Error('Unknown cmap format ' + cmap.version);
      }
    }
  }, {
    key: 'getVariationSelector',
    value: function getVariationSelector(codepoint, variationSelector) {
      if (!this.uvs) {
        return 0;
      }

      var selectors = this.uvs.varSelectors.toArray();
      var i = binarySearch(selectors, function (x) {
        return variationSelector - x.varSelector;
      });
      var sel = selectors[i];

      if (i !== -1 && sel.defaultUVS) {
        i = binarySearch(sel.defaultUVS, function (x) {
          return codepoint < x.startUnicodeValue ? -1 : codepoint > x.startUnicodeValue + x.additionalCount ? +1 : 0;
        });
      }

      if (i !== -1 && sel.nonDefaultUVS) {
        i = binarySearch(sel.nonDefaultUVS, function (x) {
          return codepoint - x.unicodeValue;
        });
        if (i !== -1) {
          return sel.nonDefaultUVS[i].glyphID;
        }
      }

      return 0;
    }
  }, {
    key: 'getCharacterSet',
    value: function getCharacterSet() {
      var cmap = this.cmap;
      switch (cmap.version) {
        case 0:
          return range(0, cmap.codeMap.length);

        case 4:
          {
            var res = [];
            var endCodes = cmap.endCode.toArray();
            for (var i = 0; i < endCodes.length; i++) {
              var tail = endCodes[i] + 1;
              var start = cmap.startCode.get(i);
              res.push.apply(res, _toConsumableArray(range(start, tail)));
            }

            return res;
          }

        case 8:
          throw new Error('TODO: cmap format 8');

        case 6:
        case 10:
          return range(cmap.firstCode, cmap.firstCode + cmap.glyphIndices.length);

        case 12:
        case 13:
          {
            var _res = [];
            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
              for (var _iterator4 = _getIterator(cmap.groups.toArray()), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                var group = _step4.value;

                _res.push.apply(_res, _toConsumableArray(range(group.startCharCode, group.endCharCode + 1)));
              }
            } catch (err) {
              _didIteratorError4 = true;
              _iteratorError4 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion4 && _iterator4.return) {
                  _iterator4.return();
                }
              } finally {
                if (_didIteratorError4) {
                  throw _iteratorError4;
                }
              }
            }

            return _res;
          }

        case 14:
          throw new Error('TODO: cmap format 14');

        default:
          throw new Error('Unknown cmap format ' + cmap.version);
      }
    }
  }, {
    key: 'codePointsForGlyph',
    value: function codePointsForGlyph(gid) {
      var cmap = this.cmap;
      switch (cmap.version) {
        case 0:
          {
            var res = [];
            for (var i = 0; i < 256; i++) {
              if (cmap.codeMap.get(i) === gid) {
                res.push(i);
              }
            }

            return res;
          }

        case 4:
          {
            var _res2 = [];
            for (var _i = 0; _i < cmap.segCount; _i++) {
              var end = cmap.endCode.get(_i);
              var start = cmap.startCode.get(_i);
              var rangeOffset = cmap.idRangeOffset.get(_i);
              var delta = cmap.idDelta.get(_i);

              for (var c = start; c <= end; c++) {
                var g = 0;
                if (rangeOffset === 0) {
                  g = c + delta;
                } else {
                  var index = rangeOffset / 2 + (c - start) - (cmap.segCount - _i);
                  g = cmap.glyphIndexArray.get(index) || 0;
                  if (g !== 0) {
                    g += delta;
                  }
                }

                if (g === gid) {
                  _res2.push(c);
                }
              }
            }

            return _res2;
          }

        case 12:
          {
            var _res3 = [];
            var _iteratorNormalCompletion5 = true;
            var _didIteratorError5 = false;
            var _iteratorError5 = undefined;

            try {
              for (var _iterator5 = _getIterator(cmap.groups.toArray()), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                var group = _step5.value;

                if (gid >= group.glyphID && gid <= group.glyphID + (group.endCharCode - group.startCharCode)) {
                  _res3.push(group.startCharCode + (gid - group.glyphID));
                }
              }
            } catch (err) {
              _didIteratorError5 = true;
              _iteratorError5 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion5 && _iterator5.return) {
                  _iterator5.return();
                }
              } finally {
                if (_didIteratorError5) {
                  throw _iteratorError5;
                }
              }
            }

            return _res3;
          }

        case 13:
          {
            var _res4 = [];
            var _iteratorNormalCompletion6 = true;
            var _didIteratorError6 = false;
            var _iteratorError6 = undefined;

            try {
              for (var _iterator6 = _getIterator(cmap.groups.toArray()), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                var _group = _step6.value;

                if (gid === _group.glyphID) {
                  _res4.push.apply(_res4, _toConsumableArray(range(_group.startCharCode, _group.endCharCode + 1)));
                }
              }
            } catch (err) {
              _didIteratorError6 = true;
              _iteratorError6 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion6 && _iterator6.return) {
                  _iterator6.return();
                }
              } finally {
                if (_didIteratorError6) {
                  throw _iteratorError6;
                }
              }
            }

            return _res4;
          }

        default:
          throw new Error('Unknown cmap format ' + cmap.version);
      }
    }
  }]);

  return CmapProcessor;
}(), (_applyDecoratedDescriptor$1(_class$1.prototype, 'getCharacterSet', [cache], _Object$getOwnPropertyDescriptor(_class$1.prototype, 'getCharacterSet'), _class$1.prototype), _applyDecoratedDescriptor$1(_class$1.prototype, 'codePointsForGlyph', [cache], _Object$getOwnPropertyDescriptor(_class$1.prototype, 'codePointsForGlyph'), _class$1.prototype)), _class$1);

var KernProcessor = function () {
  function KernProcessor(font) {
    _classCallCheck(this, KernProcessor);

    this.kern = font.kern;
  }

  _createClass(KernProcessor, [{
    key: "process",
    value: function process(glyphs, positions) {
      for (var glyphIndex = 0; glyphIndex < glyphs.length - 1; glyphIndex++) {
        var left = glyphs[glyphIndex].id;
        var right = glyphs[glyphIndex + 1].id;
        positions[glyphIndex].xAdvance += this.getKerning(left, right);
      }
    }
  }, {
    key: "getKerning",
    value: function getKerning(left, right) {
      var res = 0;

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(this.kern.tables), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var table = _step.value;

          if (table.coverage.crossStream) {
            continue;
          }

          switch (table.version) {
            case 0:
              if (!table.coverage.horizontal) {
                continue;
              }

              break;
            case 1:
              if (table.coverage.vertical || table.coverage.variation) {
                continue;
              }

              break;
            default:
              throw new Error("Unsupported kerning table version " + table.version);
          }

          var val = 0;
          var s = table.subtable;
          switch (table.format) {
            case 0:
              // TODO: binary search
              var _iteratorNormalCompletion2 = true;
              var _didIteratorError2 = false;
              var _iteratorError2 = undefined;

              try {
                for (var _iterator2 = _getIterator(s.pairs), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                  var pair = _step2.value;

                  if (pair.left === left && pair.right === right) {
                    val = pair.value;
                    break;
                  }
                }
              } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion2 && _iterator2.return) {
                    _iterator2.return();
                  }
                } finally {
                  if (_didIteratorError2) {
                    throw _iteratorError2;
                  }
                }
              }

              break;

            case 2:
              var leftOffset = 0,
                  rightOffset = 0;
              if (left >= s.leftTable.firstGlyph && left < s.leftTable.firstGlyph + s.leftTable.nGlyphs) {
                leftOffset = s.leftTable.offsets[left - s.leftTable.firstGlyph];
              } else {
                leftOffset = s.array.off;
              }

              if (right >= s.rightTable.firstGlyph && right < s.rightTable.firstGlyph + s.rightTable.nGlyphs) {
                rightOffset = s.rightTable.offsets[right - s.rightTable.firstGlyph];
              }

              var index = (leftOffset + rightOffset - s.array.off) / 2;
              val = s.array.values.get(index);
              break;

            case 3:
              if (left >= s.glyphCount || right >= s.glyphCount) {
                return 0;
              }

              val = s.kernValue[s.kernIndex[s.leftClass[left] * s.rightClassCount + s.rightClass[right]]];
              break;

            default:
              throw new Error("Unsupported kerning sub-table format " + table.format);
          }

          // Microsoft supports the override flag, which resets the result
          // Otherwise, the sum of the results from all subtables is returned
          if (table.coverage.override) {
            res = val;
          } else {
            res += val;
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return res;
    }
  }]);

  return KernProcessor;
}();

/**
 * This class is used when GPOS does not define 'mark' or 'mkmk' features
 * for positioning marks relative to base glyphs. It uses the unicode
 * combining class property to position marks.
 *
 * Based on code from Harfbuzz, thanks!
 * https://github.com/behdad/harfbuzz/blob/master/src/hb-ot-shape-fallback.cc
 */

var UnicodeLayoutEngine = function () {
  function UnicodeLayoutEngine(font) {
    _classCallCheck(this, UnicodeLayoutEngine);

    this.font = font;
  }

  _createClass(UnicodeLayoutEngine, [{
    key: 'positionGlyphs',
    value: function positionGlyphs(glyphs, positions) {
      // find each base + mark cluster, and position the marks relative to the base
      var clusterStart = 0;
      var clusterEnd = 0;
      for (var index = 0; index < glyphs.length; index++) {
        var glyph = glyphs[index];
        if (glyph.isMark) {
          // TODO: handle ligatures
          clusterEnd = index;
        } else {
          if (clusterStart !== clusterEnd) {
            this.positionCluster(glyphs, positions, clusterStart, clusterEnd);
          }

          clusterStart = clusterEnd = index;
        }
      }

      if (clusterStart !== clusterEnd) {
        this.positionCluster(glyphs, positions, clusterStart, clusterEnd);
      }

      return positions;
    }
  }, {
    key: 'positionCluster',
    value: function positionCluster(glyphs, positions, clusterStart, clusterEnd) {
      var base = glyphs[clusterStart];
      var baseBox = base.cbox.copy();

      // adjust bounding box for ligature glyphs
      if (base.codePoints.length > 1) {
        // LTR. TODO: RTL support.
        baseBox.minX += (base.codePoints.length - 1) * baseBox.width / base.codePoints.length;
      }

      var xOffset = -positions[clusterStart].xAdvance;
      var yOffset = 0;
      var yGap = this.font.unitsPerEm / 16;

      // position each of the mark glyphs relative to the base glyph
      for (var index = clusterStart + 1; index <= clusterEnd; index++) {
        var mark = glyphs[index];
        var markBox = mark.cbox;
        var position = positions[index];

        var combiningClass = this.getCombiningClass(mark.codePoints[0]);

        if (combiningClass !== 'Not_Reordered') {
          position.xOffset = position.yOffset = 0;

          // x positioning
          switch (combiningClass) {
            case 'Double_Above':
            case 'Double_Below':
              // LTR. TODO: RTL support.
              position.xOffset += baseBox.minX - markBox.width / 2 - markBox.minX;
              break;

            case 'Attached_Below_Left':
            case 'Below_Left':
            case 'Above_Left':
              // left align
              position.xOffset += baseBox.minX - markBox.minX;
              break;

            case 'Attached_Above_Right':
            case 'Below_Right':
            case 'Above_Right':
              // right align
              position.xOffset += baseBox.maxX - markBox.width - markBox.minX;
              break;

            default:
              // Attached_Below, Attached_Above, Below, Above, other
              // center align
              position.xOffset += baseBox.minX + (baseBox.width - markBox.width) / 2 - markBox.minX;
          }

          // y positioning
          switch (combiningClass) {
            case 'Double_Below':
            case 'Below_Left':
            case 'Below':
            case 'Below_Right':
            case 'Attached_Below_Left':
            case 'Attached_Below':
              // add a small gap between the glyphs if they are not attached
              if (combiningClass === 'Attached_Below_Left' || combiningClass === 'Attached_Below') {
                baseBox.minY += yGap;
              }

              position.yOffset = -baseBox.minY - markBox.maxY;
              baseBox.minY += markBox.height;
              break;

            case 'Double_Above':
            case 'Above_Left':
            case 'Above':
            case 'Above_Right':
            case 'Attached_Above':
            case 'Attached_Above_Right':
              // add a small gap between the glyphs if they are not attached
              if (combiningClass === 'Attached_Above' || combiningClass === 'Attached_Above_Right') {
                baseBox.maxY += yGap;
              }

              position.yOffset = baseBox.maxY - markBox.minY;
              baseBox.maxY += markBox.height;
              break;
          }

          position.xAdvance = position.yAdvance = 0;
          position.xOffset += xOffset;
          position.yOffset += yOffset;
        } else {
          xOffset -= position.xAdvance;
          yOffset -= position.yAdvance;
        }
      }

      return;
    }
  }, {
    key: 'getCombiningClass',
    value: function getCombiningClass(codePoint) {
      var combiningClass = unicode.getCombiningClass(codePoint);

      // Thai / Lao need some per-character work
      if ((codePoint & ~0xff) === 0x0e00) {
        if (combiningClass === 'Not_Reordered') {
          switch (codePoint) {
            case 0x0e31:
            case 0x0e34:
            case 0x0e35:
            case 0x0e36:
            case 0x0e37:
            case 0x0e47:
            case 0x0e4c:
            case 0x0e3d:
            case 0x0e4e:
              return 'Above_Right';

            case 0x0eb1:
            case 0x0eb4:
            case 0x0eb5:
            case 0x0eb6:
            case 0x0eb7:
            case 0x0ebb:
            case 0x0ecc:
            case 0x0ecd:
              return 'Above';

            case 0x0ebc:
              return 'Below';
          }
        } else if (codePoint === 0x0e3a) {
          // virama
          return 'Below_Right';
        }
      }

      switch (combiningClass) {
        // Hebrew

        case 'CCC10': // sheva
        case 'CCC11': // hataf segol
        case 'CCC12': // hataf patah
        case 'CCC13': // hataf qamats
        case 'CCC14': // hiriq
        case 'CCC15': // tsere
        case 'CCC16': // segol
        case 'CCC17': // patah
        case 'CCC18': // qamats
        case 'CCC20': // qubuts
        case 'CCC22':
          // meteg
          return 'Below';

        case 'CCC23':
          // rafe
          return 'Attached_Above';

        case 'CCC24':
          // shin dot
          return 'Above_Right';

        case 'CCC25': // sin dot
        case 'CCC19':
          // holam
          return 'Above_Left';

        case 'CCC26':
          // point varika
          return 'Above';

        case 'CCC21':
          // dagesh
          break;

        // Arabic and Syriac

        case 'CCC27': // fathatan
        case 'CCC28': // dammatan
        case 'CCC30': // fatha
        case 'CCC31': // damma
        case 'CCC33': // shadda
        case 'CCC34': // sukun
        case 'CCC35': // superscript alef
        case 'CCC36':
          // superscript alaph
          return 'Above';

        case 'CCC29': // kasratan
        case 'CCC32':
          // kasra
          return 'Below';

        // Thai

        case 'CCC103':
          // sara u / sara uu
          return 'Below_Right';

        case 'CCC107':
          // mai
          return 'Above_Right';

        // Lao

        case 'CCC118':
          // sign u / sign uu
          return 'Below';

        case 'CCC122':
          // mai
          return 'Above';

        // Tibetan

        case 'CCC129': // sign aa
        case 'CCC132':
          // sign u
          return 'Below';

        case 'CCC130':
          // sign i
          return 'Above';
      }

      return combiningClass;
    }
  }]);

  return UnicodeLayoutEngine;
}();

/**
 * Represents a glyph bounding box
 */
var BBox = function () {
  function BBox() {
    var minX = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : Infinity;
    var minY = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : Infinity;
    var maxX = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : -Infinity;
    var maxY = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : -Infinity;

    _classCallCheck(this, BBox);

    /**
     * The minimum X position in the bounding box
     * @type {number}
     */
    this.minX = minX;

    /**
     * The minimum Y position in the bounding box
     * @type {number}
     */
    this.minY = minY;

    /**
     * The maxmimum X position in the bounding box
     * @type {number}
     */
    this.maxX = maxX;

    /**
     * The maxmimum Y position in the bounding box
     * @type {number}
     */
    this.maxY = maxY;
  }

  /**
   * The width of the bounding box
   * @type {number}
   */


  _createClass(BBox, [{
    key: "addPoint",
    value: function addPoint(x, y) {
      if (x < this.minX) {
        this.minX = x;
      }

      if (y < this.minY) {
        this.minY = y;
      }

      if (x > this.maxX) {
        this.maxX = x;
      }

      if (y > this.maxY) {
        this.maxY = y;
      }
    }
  }, {
    key: "copy",
    value: function copy() {
      return new BBox(this.minX, this.minY, this.maxX, this.maxY);
    }
  }, {
    key: "width",
    get: function get() {
      return this.maxX - this.minX;
    }

    /**
     * The height of the bounding box
     * @type {number}
     */

  }, {
    key: "height",
    get: function get() {
      return this.maxY - this.minY;
    }
  }]);

  return BBox;
}();

/**
 * Represents a run of Glyph and GlyphPosition objects.
 * Returned by the font layout method.
 */

var GlyphRun = function () {
  function GlyphRun(glyphs, positions) {
    _classCallCheck(this, GlyphRun);

    /**
     * An array of Glyph objects in the run
     * @type {Glyph[]}
     */
    this.glyphs = glyphs;

    /**
     * An array of GlyphPosition objects for each glyph in the run
     * @type {GlyphPosition[]}
     */
    this.positions = positions;
  }

  /**
   * The total advance width of the run.
   * @type {number}
   */


  _createClass(GlyphRun, [{
    key: 'advanceWidth',
    get: function get() {
      var width = 0;
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(this.positions), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var position = _step.value;

          width += position.xAdvance;
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return width;
    }

    /**
     * The total advance height of the run.
     * @type {number}
     */

  }, {
    key: 'advanceHeight',
    get: function get() {
      var height = 0;
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(this.positions), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var position = _step2.value;

          height += position.yAdvance;
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      return height;
    }

    /**
     * The bounding box containing all glyphs in the run.
     * @type {BBox}
     */

  }, {
    key: 'bbox',
    get: function get() {
      var bbox = new BBox();

      var x = 0;
      var y = 0;
      for (var index = 0; index < this.glyphs.length; index++) {
        var glyph = this.glyphs[index];
        var p = this.positions[index];
        var b = glyph.bbox;

        bbox.addPoint(b.minX + x + p.xOffset, b.minY + y + p.yOffset);
        bbox.addPoint(b.maxX + x + p.xOffset, b.maxY + y + p.yOffset);

        x += p.xAdvance;
        y += p.yAdvance;
      }

      return bbox;
    }
  }]);

  return GlyphRun;
}();

/**
 * Represents positioning information for a glyph in a GlyphRun.
 */
var GlyphPosition = function GlyphPosition() {
  var xAdvance = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
  var yAdvance = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
  var xOffset = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
  var yOffset = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;

  _classCallCheck(this, GlyphPosition);

  /**
   * The amount to move the virtual pen in the X direction after rendering this glyph.
   * @type {number}
   */
  this.xAdvance = xAdvance;

  /**
   * The amount to move the virtual pen in the Y direction after rendering this glyph.
   * @type {number}
   */
  this.yAdvance = yAdvance;

  /**
   * The offset from the pen position in the X direction at which to render this glyph.
   * @type {number}
   */
  this.xOffset = xOffset;

  /**
   * The offset from the pen position in the Y direction at which to render this glyph.
   * @type {number}
   */
  this.yOffset = yOffset;
};

// This maps the Unicode Script property to an OpenType script tag
// Data from http://www.microsoft.com/typography/otspec/scripttags.htm
// and http://www.unicode.org/Public/UNIDATA/PropertyValueAliases.txt.
var UNICODE_SCRIPTS = {
  Caucasian_Albanian: 'aghb',
  Arabic: 'arab',
  Imperial_Aramaic: 'armi',
  Armenian: 'armn',
  Avestan: 'avst',
  Balinese: 'bali',
  Bamum: 'bamu',
  Bassa_Vah: 'bass',
  Batak: 'batk',
  Bengali: ['bng2', 'beng'],
  Bopomofo: 'bopo',
  Brahmi: 'brah',
  Braille: 'brai',
  Buginese: 'bugi',
  Buhid: 'buhd',
  Chakma: 'cakm',
  Canadian_Aboriginal: 'cans',
  Carian: 'cari',
  Cham: 'cham',
  Cherokee: 'cher',
  Coptic: 'copt',
  Cypriot: 'cprt',
  Cyrillic: 'cyrl',
  Devanagari: ['dev2', 'deva'],
  Deseret: 'dsrt',
  Duployan: 'dupl',
  Egyptian_Hieroglyphs: 'egyp',
  Elbasan: 'elba',
  Ethiopic: 'ethi',
  Georgian: 'geor',
  Glagolitic: 'glag',
  Gothic: 'goth',
  Grantha: 'gran',
  Greek: 'grek',
  Gujarati: ['gjr2', 'gujr'],
  Gurmukhi: ['gur2', 'guru'],
  Hangul: 'hang',
  Han: 'hani',
  Hanunoo: 'hano',
  Hebrew: 'hebr',
  Hiragana: 'hira',
  Pahawh_Hmong: 'hmng',
  Katakana_Or_Hiragana: 'hrkt',
  Old_Italic: 'ital',
  Javanese: 'java',
  Kayah_Li: 'kali',
  Katakana: 'kana',
  Kharoshthi: 'khar',
  Khmer: 'khmr',
  Khojki: 'khoj',
  Kannada: ['knd2', 'knda'],
  Kaithi: 'kthi',
  Tai_Tham: 'lana',
  Lao: 'lao ',
  Latin: 'latn',
  Lepcha: 'lepc',
  Limbu: 'limb',
  Linear_A: 'lina',
  Linear_B: 'linb',
  Lisu: 'lisu',
  Lycian: 'lyci',
  Lydian: 'lydi',
  Mahajani: 'mahj',
  Mandaic: 'mand',
  Manichaean: 'mani',
  Mende_Kikakui: 'mend',
  Meroitic_Cursive: 'merc',
  Meroitic_Hieroglyphs: 'mero',
  Malayalam: ['mlm2', 'mlym'],
  Modi: 'modi',
  Mongolian: 'mong',
  Mro: 'mroo',
  Meetei_Mayek: 'mtei',
  Myanmar: ['mym2', 'mymr'],
  Old_North_Arabian: 'narb',
  Nabataean: 'nbat',
  Nko: 'nko ',
  Ogham: 'ogam',
  Ol_Chiki: 'olck',
  Old_Turkic: 'orkh',
  Oriya: 'orya',
  Osmanya: 'osma',
  Palmyrene: 'palm',
  Pau_Cin_Hau: 'pauc',
  Old_Permic: 'perm',
  Phags_Pa: 'phag',
  Inscriptional_Pahlavi: 'phli',
  Psalter_Pahlavi: 'phlp',
  Phoenician: 'phnx',
  Miao: 'plrd',
  Inscriptional_Parthian: 'prti',
  Rejang: 'rjng',
  Runic: 'runr',
  Samaritan: 'samr',
  Old_South_Arabian: 'sarb',
  Saurashtra: 'saur',
  Shavian: 'shaw',
  Sharada: 'shrd',
  Siddham: 'sidd',
  Khudawadi: 'sind',
  Sinhala: 'sinh',
  Sora_Sompeng: 'sora',
  Sundanese: 'sund',
  Syloti_Nagri: 'sylo',
  Syriac: 'syrc',
  Tagbanwa: 'tagb',
  Takri: 'takr',
  Tai_Le: 'tale',
  New_Tai_Lue: 'talu',
  Tamil: 'taml',
  Tai_Viet: 'tavt',
  Telugu: ['tel2', 'telu'],
  Tifinagh: 'tfng',
  Tagalog: 'tglg',
  Thaana: 'thaa',
  Thai: 'thai',
  Tibetan: 'tibt',
  Tirhuta: 'tirh',
  Ugaritic: 'ugar',
  Vai: 'vai ',
  Warang_Citi: 'wara',
  Old_Persian: 'xpeo',
  Cuneiform: 'xsux',
  Yi: 'yi  ',
  Inherited: 'zinh',
  Common: 'zyyy',
  Unknown: 'zzzz'
};

function forString(string) {
  var len = string.length;
  var idx = 0;
  while (idx < len) {
    var code = string.charCodeAt(idx++);

    // Check if this is a high surrogate
    if (0xd800 <= code && code <= 0xdbff && idx < len) {
      var next = string.charCodeAt(idx);

      // Check if this is a low surrogate
      if (0xdc00 <= next && next <= 0xdfff) {
        idx++;
        code = ((code & 0x3FF) << 10) + (next & 0x3FF) + 0x10000;
      }
    }

    var script = unicode.getScript(code);
    if (script !== 'Common' && script !== 'Inherited' && script !== 'Unknown') {
      return UNICODE_SCRIPTS[script];
    }
  }

  return UNICODE_SCRIPTS.Unknown;
}

function forCodePoints(codePoints) {
  for (var i = 0; i < codePoints.length; i++) {
    var codePoint = codePoints[i];
    var script = unicode.getScript(codePoint);
    if (script !== 'Common' && script !== 'Inherited' && script !== 'Unknown') {
      return UNICODE_SCRIPTS[script];
    }
  }

  return UNICODE_SCRIPTS.Unknown;
}

// The scripts in this map are written from right to left
var RTL = {
  arab: true, // Arabic
  hebr: true, // Hebrew
  syrc: true, // Syriac
  thaa: true, // Thaana
  cprt: true, // Cypriot Syllabary
  khar: true, // Kharosthi
  phnx: true, // Phoenician
  'nko ': true, // N'Ko
  lydi: true, // Lydian
  avst: true, // Avestan
  armi: true, // Imperial Aramaic
  phli: true, // Inscriptional Pahlavi
  prti: true, // Inscriptional Parthian
  sarb: true, // Old South Arabian
  orkh: true, // Old Turkic, Orkhon Runic
  samr: true, // Samaritan
  mand: true, // Mandaic, Mandaean
  merc: true, // Meroitic Cursive
  mero: true, // Meroitic Hieroglyphs

  // Unicode 7.0 (not listed on http://www.microsoft.com/typography/otspec/scripttags.htm)
  mani: true, // Manichaean
  mend: true, // Mende Kikakui
  nbat: true, // Nabataean
  narb: true, // Old North Arabian
  palm: true, // Palmyrene
  phlp: true // Psalter Pahlavi
};

function direction(script) {
  if (RTL[script]) {
    return 'rtl';
  }

  return 'ltr';
}

// see https://developer.apple.com/fonts/TrueType-Reference-Manual/RM09/AppendixF.html
// and /System/Library/Frameworks/CoreText.framework/Versions/A/Headers/SFNTLayoutTypes.h on a Mac
var features = {
  allTypographicFeatures: {
    code: 0,
    exclusive: false,
    allTypeFeatures: 0
  },
  ligatures: {
    code: 1,
    exclusive: false,
    requiredLigatures: 0,
    commonLigatures: 2,
    rareLigatures: 4,
    // logos: 6
    rebusPictures: 8,
    diphthongLigatures: 10,
    squaredLigatures: 12,
    abbrevSquaredLigatures: 14,
    symbolLigatures: 16,
    contextualLigatures: 18,
    historicalLigatures: 20
  },
  cursiveConnection: {
    code: 2,
    exclusive: true,
    unconnected: 0,
    partiallyConnected: 1,
    cursive: 2
  },
  letterCase: {
    code: 3,
    exclusive: true
  },
  // upperAndLowerCase: 0          # deprecated
  // allCaps: 1                    # deprecated
  // allLowerCase: 2               # deprecated
  // smallCaps: 3                  # deprecated
  // initialCaps: 4                # deprecated
  // initialCapsAndSmallCaps: 5    # deprecated
  verticalSubstitution: {
    code: 4,
    exclusive: false,
    substituteVerticalForms: 0
  },
  linguisticRearrangement: {
    code: 5,
    exclusive: false,
    linguisticRearrangement: 0
  },
  numberSpacing: {
    code: 6,
    exclusive: true,
    monospacedNumbers: 0,
    proportionalNumbers: 1,
    thirdWidthNumbers: 2,
    quarterWidthNumbers: 3
  },
  smartSwash: {
    code: 8,
    exclusive: false,
    wordInitialSwashes: 0,
    wordFinalSwashes: 2,
    // lineInitialSwashes: 4
    // lineFinalSwashes: 6
    nonFinalSwashes: 8
  },
  diacritics: {
    code: 9,
    exclusive: true,
    showDiacritics: 0,
    hideDiacritics: 1,
    decomposeDiacritics: 2
  },
  verticalPosition: {
    code: 10,
    exclusive: true,
    normalPosition: 0,
    superiors: 1,
    inferiors: 2,
    ordinals: 3,
    scientificInferiors: 4
  },
  fractions: {
    code: 11,
    exclusive: true,
    noFractions: 0,
    verticalFractions: 1,
    diagonalFractions: 2
  },
  overlappingCharacters: {
    code: 13,
    exclusive: false,
    preventOverlap: 0
  },
  typographicExtras: {
    code: 14,
    exclusive: false,
    // hyphensToEmDash: 0
    // hyphenToEnDash: 2
    slashedZero: 4
  },
  // formInterrobang: 6
  // smartQuotes: 8
  // periodsToEllipsis: 10
  mathematicalExtras: {
    code: 15,
    exclusive: false,
    // hyphenToMinus: 0
    // asteristoMultiply: 2
    // slashToDivide: 4
    // inequalityLigatures: 6
    // exponents: 8
    mathematicalGreek: 10
  },
  ornamentSets: {
    code: 16,
    exclusive: true,
    noOrnaments: 0,
    dingbats: 1,
    piCharacters: 2,
    fleurons: 3,
    decorativeBorders: 4,
    internationalSymbols: 5,
    mathSymbols: 6
  },
  characterAlternatives: {
    code: 17,
    exclusive: true,
    noAlternates: 0
  },
  // user defined options
  designComplexity: {
    code: 18,
    exclusive: true,
    designLevel1: 0,
    designLevel2: 1,
    designLevel3: 2,
    designLevel4: 3,
    designLevel5: 4
  },
  styleOptions: {
    code: 19,
    exclusive: true,
    noStyleOptions: 0,
    displayText: 1,
    engravedText: 2,
    illuminatedCaps: 3,
    titlingCaps: 4,
    tallCaps: 5
  },
  characterShape: {
    code: 20,
    exclusive: true,
    traditionalCharacters: 0,
    simplifiedCharacters: 1,
    JIS1978Characters: 2,
    JIS1983Characters: 3,
    JIS1990Characters: 4,
    traditionalAltOne: 5,
    traditionalAltTwo: 6,
    traditionalAltThree: 7,
    traditionalAltFour: 8,
    traditionalAltFive: 9,
    expertCharacters: 10,
    JIS2004Characters: 11,
    hojoCharacters: 12,
    NLCCharacters: 13,
    traditionalNamesCharacters: 14
  },
  numberCase: {
    code: 21,
    exclusive: true,
    lowerCaseNumbers: 0,
    upperCaseNumbers: 1
  },
  textSpacing: {
    code: 22,
    exclusive: true,
    proportionalText: 0,
    monospacedText: 1,
    halfWidthText: 2,
    thirdWidthText: 3,
    quarterWidthText: 4,
    altProportionalText: 5,
    altHalfWidthText: 6
  },
  transliteration: {
    code: 23,
    exclusive: true,
    noTransliteration: 0
  },
  // hanjaToHangul: 1
  // hiraganaToKatakana: 2
  // katakanaToHiragana: 3
  // kanaToRomanization: 4
  // romanizationToHiragana: 5
  // romanizationToKatakana: 6
  // hanjaToHangulAltOne: 7
  // hanjaToHangulAltTwo: 8
  // hanjaToHangulAltThree: 9
  annotation: {
    code: 24,
    exclusive: true,
    noAnnotation: 0,
    boxAnnotation: 1,
    roundedBoxAnnotation: 2,
    circleAnnotation: 3,
    invertedCircleAnnotation: 4,
    parenthesisAnnotation: 5,
    periodAnnotation: 6,
    romanNumeralAnnotation: 7,
    diamondAnnotation: 8,
    invertedBoxAnnotation: 9,
    invertedRoundedBoxAnnotation: 10
  },
  kanaSpacing: {
    code: 25,
    exclusive: true,
    fullWidthKana: 0,
    proportionalKana: 1
  },
  ideographicSpacing: {
    code: 26,
    exclusive: true,
    fullWidthIdeographs: 0,
    proportionalIdeographs: 1,
    halfWidthIdeographs: 2
  },
  unicodeDecomposition: {
    code: 27,
    exclusive: false,
    canonicalComposition: 0,
    compatibilityComposition: 2,
    transcodingComposition: 4
  },
  rubyKana: {
    code: 28,
    exclusive: false,
    // noRubyKana: 0     # deprecated - use rubyKanaOff instead
    // rubyKana: 1     # deprecated - use rubyKanaOn instead
    rubyKana: 2
  },
  CJKSymbolAlternatives: {
    code: 29,
    exclusive: true,
    noCJKSymbolAlternatives: 0,
    CJKSymbolAltOne: 1,
    CJKSymbolAltTwo: 2,
    CJKSymbolAltThree: 3,
    CJKSymbolAltFour: 4,
    CJKSymbolAltFive: 5
  },
  ideographicAlternatives: {
    code: 30,
    exclusive: true,
    noIdeographicAlternatives: 0,
    ideographicAltOne: 1,
    ideographicAltTwo: 2,
    ideographicAltThree: 3,
    ideographicAltFour: 4,
    ideographicAltFive: 5
  },
  CJKVerticalRomanPlacement: {
    code: 31,
    exclusive: true,
    CJKVerticalRomanCentered: 0,
    CJKVerticalRomanHBaseline: 1
  },
  italicCJKRoman: {
    code: 32,
    exclusive: false,
    // noCJKItalicRoman: 0     # deprecated - use CJKItalicRomanOff instead
    // CJKItalicRoman: 1     # deprecated - use CJKItalicRomanOn instead
    CJKItalicRoman: 2
  },
  caseSensitiveLayout: {
    code: 33,
    exclusive: false,
    caseSensitiveLayout: 0,
    caseSensitiveSpacing: 2
  },
  alternateKana: {
    code: 34,
    exclusive: false,
    alternateHorizKana: 0,
    alternateVertKana: 2
  },
  stylisticAlternatives: {
    code: 35,
    exclusive: false,
    noStylisticAlternates: 0,
    stylisticAltOne: 2,
    stylisticAltTwo: 4,
    stylisticAltThree: 6,
    stylisticAltFour: 8,
    stylisticAltFive: 10,
    stylisticAltSix: 12,
    stylisticAltSeven: 14,
    stylisticAltEight: 16,
    stylisticAltNine: 18,
    stylisticAltTen: 20,
    stylisticAltEleven: 22,
    stylisticAltTwelve: 24,
    stylisticAltThirteen: 26,
    stylisticAltFourteen: 28,
    stylisticAltFifteen: 30,
    stylisticAltSixteen: 32,
    stylisticAltSeventeen: 34,
    stylisticAltEighteen: 36,
    stylisticAltNineteen: 38,
    stylisticAltTwenty: 40
  },
  contextualAlternates: {
    code: 36,
    exclusive: false,
    contextualAlternates: 0,
    swashAlternates: 2,
    contextualSwashAlternates: 4
  },
  lowerCase: {
    code: 37,
    exclusive: true,
    defaultLowerCase: 0,
    lowerCaseSmallCaps: 1,
    lowerCasePetiteCaps: 2
  },
  upperCase: {
    code: 38,
    exclusive: true,
    defaultUpperCase: 0,
    upperCaseSmallCaps: 1,
    upperCasePetiteCaps: 2
  },
  languageTag: { // indices into ltag table
    code: 39,
    exclusive: true
  },
  CJKRomanSpacing: {
    code: 103,
    exclusive: true,
    halfWidthCJKRoman: 0,
    proportionalCJKRoman: 1,
    defaultCJKRoman: 2,
    fullWidthCJKRoman: 3
  }
};

var feature = function feature(name, selector) {
  return [features[name].code, features[name][selector]];
};

var OTMapping = {
  rlig: feature('ligatures', 'requiredLigatures'),
  clig: feature('ligatures', 'contextualLigatures'),
  dlig: feature('ligatures', 'rareLigatures'),
  hlig: feature('ligatures', 'historicalLigatures'),
  liga: feature('ligatures', 'commonLigatures'),
  hist: feature('ligatures', 'historicalLigatures'), // ??

  smcp: feature('lowerCase', 'lowerCaseSmallCaps'),
  pcap: feature('lowerCase', 'lowerCasePetiteCaps'),

  frac: feature('fractions', 'diagonalFractions'),
  dnom: feature('fractions', 'diagonalFractions'), // ??
  numr: feature('fractions', 'diagonalFractions'), // ??
  afrc: feature('fractions', 'verticalFractions'),
  // aalt
  // abvf, abvm, abvs, akhn, blwf, blwm, blws, cfar, cjct, cpsp, falt, isol, jalt, ljmo, mset?
  // ltra, ltrm, nukt, pref, pres, pstf, psts, rand, rkrf, rphf, rtla, rtlm, size, tjmo, tnum?
  // unic, vatu, vhal, vjmo, vpal, vrt2
  // dist -> trak table?
  // kern, vkrn -> kern table
  // lfbd + opbd + rtbd -> opbd table?
  // mark, mkmk -> acnt table?
  // locl -> languageTag + ltag table

  case: feature('caseSensitiveLayout', 'caseSensitiveLayout'), // also caseSensitiveSpacing
  ccmp: feature('unicodeDecomposition', 'canonicalComposition'), // compatibilityComposition?
  cpct: feature('CJKVerticalRomanPlacement', 'CJKVerticalRomanCentered'), // guess..., probably not given below
  valt: feature('CJKVerticalRomanPlacement', 'CJKVerticalRomanCentered'),
  swsh: feature('contextualAlternates', 'swashAlternates'),
  cswh: feature('contextualAlternates', 'contextualSwashAlternates'),
  curs: feature('cursiveConnection', 'cursive'), // ??
  c2pc: feature('upperCase', 'upperCasePetiteCaps'),
  c2sc: feature('upperCase', 'upperCaseSmallCaps'),

  init: feature('smartSwash', 'wordInitialSwashes'), // ??
  fin2: feature('smartSwash', 'wordFinalSwashes'), // ??
  medi: feature('smartSwash', 'nonFinalSwashes'), // ??
  med2: feature('smartSwash', 'nonFinalSwashes'), // ??
  fin3: feature('smartSwash', 'wordFinalSwashes'), // ??
  fina: feature('smartSwash', 'wordFinalSwashes'), // ??

  pkna: feature('kanaSpacing', 'proportionalKana'),
  half: feature('textSpacing', 'halfWidthText'), // also HalfWidthCJKRoman, HalfWidthIdeographs?
  halt: feature('textSpacing', 'altHalfWidthText'),

  hkna: feature('alternateKana', 'alternateHorizKana'),
  vkna: feature('alternateKana', 'alternateVertKana'),
  // hngl: feature 'transliteration', 'hanjaToHangulSelector' # deprecated

  ital: feature('italicCJKRoman', 'CJKItalicRoman'),
  lnum: feature('numberCase', 'upperCaseNumbers'),
  onum: feature('numberCase', 'lowerCaseNumbers'),
  mgrk: feature('mathematicalExtras', 'mathematicalGreek'),

  // nalt: not enough info. what type of annotation?
  // ornm: ditto, which ornament style?

  calt: feature('contextualAlternates', 'contextualAlternates'), // or more?
  vrt2: feature('verticalSubstitution', 'substituteVerticalForms'), // oh... below?
  vert: feature('verticalSubstitution', 'substituteVerticalForms'),
  tnum: feature('numberSpacing', 'monospacedNumbers'),
  pnum: feature('numberSpacing', 'proportionalNumbers'),
  sups: feature('verticalPosition', 'superiors'),
  subs: feature('verticalPosition', 'inferiors'),
  ordn: feature('verticalPosition', 'ordinals'),
  pwid: feature('textSpacing', 'proportionalText'),
  hwid: feature('textSpacing', 'halfWidthText'),
  qwid: feature('textSpacing', 'quarterWidthText'), // also QuarterWidthNumbers?
  twid: feature('textSpacing', 'thirdWidthText'), // also ThirdWidthNumbers?
  fwid: feature('textSpacing', 'proportionalText'), //??
  palt: feature('textSpacing', 'altProportionalText'),
  trad: feature('characterShape', 'traditionalCharacters'),
  smpl: feature('characterShape', 'simplifiedCharacters'),
  jp78: feature('characterShape', 'JIS1978Characters'),
  jp83: feature('characterShape', 'JIS1983Characters'),
  jp90: feature('characterShape', 'JIS1990Characters'),
  jp04: feature('characterShape', 'JIS2004Characters'),
  expt: feature('characterShape', 'expertCharacters'),
  hojo: feature('characterShape', 'hojoCharacters'),
  nlck: feature('characterShape', 'NLCCharacters'),
  tnam: feature('characterShape', 'traditionalNamesCharacters'),
  ruby: feature('rubyKana', 'rubyKana'),
  titl: feature('styleOptions', 'titlingCaps'),
  zero: feature('typographicExtras', 'slashedZero'),

  ss01: feature('stylisticAlternatives', 'stylisticAltOne'),
  ss02: feature('stylisticAlternatives', 'stylisticAltTwo'),
  ss03: feature('stylisticAlternatives', 'stylisticAltThree'),
  ss04: feature('stylisticAlternatives', 'stylisticAltFour'),
  ss05: feature('stylisticAlternatives', 'stylisticAltFive'),
  ss06: feature('stylisticAlternatives', 'stylisticAltSix'),
  ss07: feature('stylisticAlternatives', 'stylisticAltSeven'),
  ss08: feature('stylisticAlternatives', 'stylisticAltEight'),
  ss09: feature('stylisticAlternatives', 'stylisticAltNine'),
  ss10: feature('stylisticAlternatives', 'stylisticAltTen'),
  ss11: feature('stylisticAlternatives', 'stylisticAltEleven'),
  ss12: feature('stylisticAlternatives', 'stylisticAltTwelve'),
  ss13: feature('stylisticAlternatives', 'stylisticAltThirteen'),
  ss14: feature('stylisticAlternatives', 'stylisticAltFourteen'),
  ss15: feature('stylisticAlternatives', 'stylisticAltFifteen'),
  ss16: feature('stylisticAlternatives', 'stylisticAltSixteen'),
  ss17: feature('stylisticAlternatives', 'stylisticAltSeventeen'),
  ss18: feature('stylisticAlternatives', 'stylisticAltEighteen'),
  ss19: feature('stylisticAlternatives', 'stylisticAltNineteen'),
  ss20: feature('stylisticAlternatives', 'stylisticAltTwenty')
};

// salt: feature 'stylisticAlternatives', 'stylisticAltOne' # hmm, which one to choose

// Add cv01-cv99 features
for (var i = 1; i <= 99; i++) {
  OTMapping['cv' + ('00' + i).slice(-2)] = [features.characterAlternatives.code, i];
}

// create inverse mapping
var AATMapping = {};
for (var ot in OTMapping) {
  var aat = OTMapping[ot];
  if (AATMapping[aat[0]] == null) {
    AATMapping[aat[0]] = {};
  }

  AATMapping[aat[0]][aat[1]] = ot;
}

// Maps an array of OpenType features to AAT features
// in the form of {featureType:{featureSetting:true}}
function mapOTToAAT(features) {
  var res = {};
  for (var k = 0; k < features.length; k++) {
    var r = void 0;
    if (r = OTMapping[features[k]]) {
      if (res[r[0]] == null) {
        res[r[0]] = {};
      }

      res[r[0]][r[1]] = true;
    }
  }

  return res;
}

// Maps strings in a [featureType, featureSetting]
// to their equivalent number codes
function mapFeatureStrings(f) {
  var _f = _slicedToArray(f, 2),
      type = _f[0],
      setting = _f[1];

  if (isNaN(type)) {
    var typeCode = features[type] && features[type].code;
  } else {
    var typeCode = type;
  }

  if (isNaN(setting)) {
    var settingCode = features[type] && features[type][setting];
  } else {
    var settingCode = setting;
  }

  return [typeCode, settingCode];
}

// Maps AAT features to an array of OpenType features
// Supports both arrays in the form of [[featureType, featureSetting]]
// and objects in the form of {featureType:{featureSetting:true}}
// featureTypes and featureSettings can be either strings or number codes
function mapAATToOT(features) {
  var res = {};
  if (Array.isArray(features)) {
    for (var k = 0; k < features.length; k++) {
      var r = void 0;
      var f = mapFeatureStrings(features[k]);
      if (r = AATMapping[f[0]] && AATMapping[f[0]][f[1]]) {
        res[r] = true;
      }
    }
  } else if ((typeof features === 'undefined' ? 'undefined' : _typeof(features)) === 'object') {
    for (var type in features) {
      var _feature = features[type];
      for (var setting in _feature) {
        var _r = void 0;
        var _f2 = mapFeatureStrings([type, setting]);
        if (_feature[setting] && (_r = AATMapping[_f2[0]] && AATMapping[_f2[0]][_f2[1]])) {
          res[_r] = true;
        }
      }
    }
  }

  return _Object$keys(res);
}

var _class$3;
function _applyDecoratedDescriptor$3(target, property, decorators, descriptor, context) {
  var desc = {};
  Object['ke' + 'ys'](descriptor).forEach(function (key) {
    desc[key] = descriptor[key];
  });
  desc.enumerable = !!desc.enumerable;
  desc.configurable = !!desc.configurable;

  if ('value' in desc || desc.initializer) {
    desc.writable = true;
  }

  desc = decorators.slice().reverse().reduce(function (desc, decorator) {
    return decorator(target, property, desc) || desc;
  }, desc);

  if (context && desc.initializer !== void 0) {
    desc.value = desc.initializer ? desc.initializer.call(context) : void 0;
    desc.initializer = undefined;
  }

  if (desc.initializer === void 0) {
    Object['define' + 'Property'](target, property, desc);
    desc = null;
  }

  return desc;
}

var AATLookupTable = (_class$3 = function () {
  function AATLookupTable(table) {
    _classCallCheck(this, AATLookupTable);

    this.table = table;
  }

  _createClass(AATLookupTable, [{
    key: 'lookup',
    value: function lookup(glyph) {
      switch (this.table.version) {
        case 0:
          // simple array format
          return this.table.values.getItem(glyph);

        case 2: // segment format
        case 4:
          {
            var min = 0;
            var max = this.table.binarySearchHeader.nUnits - 1;

            while (min <= max) {
              var mid = min + max >> 1;
              var seg = this.table.segments[mid];

              // special end of search value
              if (seg.firstGlyph === 0xffff) {
                return null;
              }

              if (glyph < seg.firstGlyph) {
                max = mid - 1;
              } else if (glyph > seg.lastGlyph) {
                min = mid + 1;
              } else {
                if (this.table.version === 2) {
                  return seg.value;
                } else {
                  return seg.values[glyph - seg.firstGlyph];
                }
              }
            }

            return null;
          }

        case 6:
          {
            // lookup single
            var _min = 0;
            var _max = this.table.binarySearchHeader.nUnits - 1;

            while (_min <= _max) {
              var mid = _min + _max >> 1;
              var seg = this.table.segments[mid];

              // special end of search value
              if (seg.glyph === 0xffff) {
                return null;
              }

              if (glyph < seg.glyph) {
                _max = mid - 1;
              } else if (glyph > seg.glyph) {
                _min = mid + 1;
              } else {
                return seg.value;
              }
            }

            return null;
          }

        case 8:
          // lookup trimmed
          return this.table.values[glyph - this.table.firstGlyph];

        default:
          throw new Error('Unknown lookup table format: ' + this.table.version);
      }
    }
  }, {
    key: 'glyphsForValue',
    value: function glyphsForValue(classValue) {
      var res = [];

      switch (this.table.version) {
        case 2: // segment format
        case 4:
          {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
              for (var _iterator = _getIterator(this.table.segments), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var segment = _step.value;

                if (this.table.version === 2 && segment.value === classValue) {
                  res.push.apply(res, _toConsumableArray(range(segment.firstGlyph, segment.lastGlyph + 1)));
                } else {
                  for (var index = 0; index < segment.values.length; index++) {
                    if (segment.values[index] === classValue) {
                      res.push(segment.firstGlyph + index);
                    }
                  }
                }
              }
            } catch (err) {
              _didIteratorError = true;
              _iteratorError = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion && _iterator.return) {
                  _iterator.return();
                }
              } finally {
                if (_didIteratorError) {
                  throw _iteratorError;
                }
              }
            }

            break;
          }

        case 6:
          {
            // lookup single
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
              for (var _iterator2 = _getIterator(this.table.segments), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var _segment = _step2.value;

                if (_segment.value === classValue) {
                  res.push(_segment.glyph);
                }
              }
            } catch (err) {
              _didIteratorError2 = true;
              _iteratorError2 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion2 && _iterator2.return) {
                  _iterator2.return();
                }
              } finally {
                if (_didIteratorError2) {
                  throw _iteratorError2;
                }
              }
            }

            break;
          }

        case 8:
          {
            // lookup trimmed
            for (var i = 0; i < this.table.values.length; i++) {
              if (this.table.values[i] === classValue) {
                res.push(this.table.firstGlyph + i);
              }
            }

            break;
          }

        default:
          throw new Error('Unknown lookup table format: ' + this.table.version);
      }

      return res;
    }
  }]);

  return AATLookupTable;
}(), (_applyDecoratedDescriptor$3(_class$3.prototype, 'glyphsForValue', [cache], _Object$getOwnPropertyDescriptor(_class$3.prototype, 'glyphsForValue'), _class$3.prototype)), _class$3);

var START_OF_TEXT_STATE = 0;
var END_OF_TEXT_CLASS = 0;
var OUT_OF_BOUNDS_CLASS = 1;
var DELETED_GLYPH_CLASS = 2;
var DONT_ADVANCE = 0x4000;

var AATStateMachine = function () {
  function AATStateMachine(stateTable) {
    _classCallCheck(this, AATStateMachine);

    this.stateTable = stateTable;
    this.lookupTable = new AATLookupTable(stateTable.classTable);
  }

  _createClass(AATStateMachine, [{
    key: 'process',
    value: function process(glyphs, reverse, processEntry) {
      var currentState = START_OF_TEXT_STATE; // START_OF_LINE_STATE is used for kashida glyph insertions sometimes I think?
      var index = reverse ? glyphs.length - 1 : 0;
      var dir = reverse ? -1 : 1;

      while (dir === 1 && index <= glyphs.length || dir === -1 && index >= -1) {
        var glyph = null;
        var classCode = OUT_OF_BOUNDS_CLASS;
        var shouldAdvance = true;

        if (index === glyphs.length || index === -1) {
          classCode = END_OF_TEXT_CLASS;
        } else {
          glyph = glyphs[index];
          if (glyph.id === 0xffff) {
            // deleted glyph
            classCode = DELETED_GLYPH_CLASS;
          } else {
            classCode = this.lookupTable.lookup(glyph.id);
            if (classCode == null) {
              classCode = OUT_OF_BOUNDS_CLASS;
            }
          }
        }

        var row = this.stateTable.stateArray.getItem(currentState);
        var entryIndex = row[classCode];
        var entry = this.stateTable.entryTable.getItem(entryIndex);

        if (classCode !== END_OF_TEXT_CLASS && classCode !== DELETED_GLYPH_CLASS) {
          processEntry(glyph, entry, index);
          shouldAdvance = !(entry.flags & DONT_ADVANCE);
        }

        currentState = entry.newState;
        if (shouldAdvance) {
          index += dir;
        }
      }

      return glyphs;
    }

    /**
     * Performs a depth-first traversal of the glyph strings
     * represented by the state machine.
     */

  }, {
    key: 'traverse',
    value: function traverse(opts) {
      var state = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      var visited = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : new _Set();

      if (visited.has(state)) {
        return;
      }

      visited.add(state);

      var _stateTable = this.stateTable,
          nClasses = _stateTable.nClasses,
          stateArray = _stateTable.stateArray,
          entryTable = _stateTable.entryTable;

      var row = stateArray.getItem(state);

      // Skip predefined classes
      for (var classCode = 4; classCode < nClasses; classCode++) {
        var entryIndex = row[classCode];
        var entry = entryTable.getItem(entryIndex);

        // Try all glyphs in the class
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = _getIterator(this.lookupTable.glyphsForValue(classCode)), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var glyph = _step.value;

            if (opts.enter) {
              opts.enter(glyph, entry);
            }

            if (entry.newState !== 0) {
              this.traverse(opts, entry.newState, visited);
            }

            if (opts.exit) {
              opts.exit(glyph, entry);
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }
      }
    }
  }]);

  return AATStateMachine;
}();

var _class$2;
function _applyDecoratedDescriptor$2(target, property, decorators, descriptor, context) {
  var desc = {};
  Object['ke' + 'ys'](descriptor).forEach(function (key) {
    desc[key] = descriptor[key];
  });
  desc.enumerable = !!desc.enumerable;
  desc.configurable = !!desc.configurable;

  if ('value' in desc || desc.initializer) {
    desc.writable = true;
  }

  desc = decorators.slice().reverse().reduce(function (desc, decorator) {
    return decorator(target, property, desc) || desc;
  }, desc);

  if (context && desc.initializer !== void 0) {
    desc.value = desc.initializer ? desc.initializer.call(context) : void 0;
    desc.initializer = undefined;
  }

  if (desc.initializer === void 0) {
    Object['define' + 'Property'](target, property, desc);
    desc = null;
  }

  return desc;
}

// indic replacement flags
var MARK_FIRST = 0x8000;
var MARK_LAST = 0x2000;
var VERB = 0x000F;

// contextual substitution and glyph insertion flag
var SET_MARK = 0x8000;

// ligature entry flags
var SET_COMPONENT = 0x8000;
var PERFORM_ACTION = 0x2000;

// ligature action masks
var LAST_MASK = 0x80000000;
var STORE_MASK = 0x40000000;
var OFFSET_MASK = 0x3FFFFFFF;

var REVERSE_DIRECTION = 0x400000;
var CURRENT_INSERT_BEFORE = 0x0800;
var MARKED_INSERT_BEFORE = 0x0400;
var CURRENT_INSERT_COUNT = 0x03E0;
var MARKED_INSERT_COUNT = 0x001F;

var AATMorxProcessor = (_class$2 = function () {
  function AATMorxProcessor(font) {
    _classCallCheck(this, AATMorxProcessor);

    this.processIndicRearragement = this.processIndicRearragement.bind(this);
    this.processContextualSubstitution = this.processContextualSubstitution.bind(this);
    this.processLigature = this.processLigature.bind(this);
    this.processNoncontextualSubstitutions = this.processNoncontextualSubstitutions.bind(this);
    this.processGlyphInsertion = this.processGlyphInsertion.bind(this);
    this.font = font;
    this.morx = font.morx;
    this.inputCache = null;
  }

  // Processes an array of glyphs and applies the specified features
  // Features should be in the form of {featureType:{featureSetting:true}}


  _createClass(AATMorxProcessor, [{
    key: 'process',
    value: function process(glyphs) {
      var features = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(this.morx.chains), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var chain = _step.value;

          var flags = chain.defaultFlags;

          // enable/disable the requested features
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = _getIterator(chain.features), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var feature = _step2.value;

              var f = void 0;
              if ((f = features[feature.featureType]) && f[feature.featureSetting]) {
                flags &= feature.disableFlags;
                flags |= feature.enableFlags;
              }
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2.return) {
                _iterator2.return();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
          }

          var _iteratorNormalCompletion3 = true;
          var _didIteratorError3 = false;
          var _iteratorError3 = undefined;

          try {
            for (var _iterator3 = _getIterator(chain.subtables), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
              var subtable = _step3.value;

              if (subtable.subFeatureFlags & flags) {
                this.processSubtable(subtable, glyphs);
              }
            }
          } catch (err) {
            _didIteratorError3 = true;
            _iteratorError3 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion3 && _iterator3.return) {
                _iterator3.return();
              }
            } finally {
              if (_didIteratorError3) {
                throw _iteratorError3;
              }
            }
          }
        }

        // remove deleted glyphs
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      var index = glyphs.length - 1;
      while (index >= 0) {
        if (glyphs[index].id === 0xffff) {
          glyphs.splice(index, 1);
        }

        index--;
      }

      return glyphs;
    }
  }, {
    key: 'processSubtable',
    value: function processSubtable(subtable, glyphs) {
      this.subtable = subtable;
      this.glyphs = glyphs;
      if (this.subtable.type === 4) {
        this.processNoncontextualSubstitutions(this.subtable, this.glyphs);
        return;
      }

      this.ligatureStack = [];
      this.markedGlyph = null;
      this.firstGlyph = null;
      this.lastGlyph = null;
      this.markedIndex = null;

      var stateMachine = this.getStateMachine(subtable);
      var process = this.getProcessor();

      var reverse = !!(this.subtable.coverage & REVERSE_DIRECTION);
      return stateMachine.process(this.glyphs, reverse, process);
    }
  }, {
    key: 'getStateMachine',
    value: function getStateMachine(subtable) {
      return new AATStateMachine(subtable.table.stateTable);
    }
  }, {
    key: 'getProcessor',
    value: function getProcessor() {
      switch (this.subtable.type) {
        case 0:
          return this.processIndicRearragement;
        case 1:
          return this.processContextualSubstitution;
        case 2:
          return this.processLigature;
        case 4:
          return this.processNoncontextualSubstitutions;
        case 5:
          return this.processGlyphInsertion;
        default:
          throw new Error('Invalid morx subtable type: ' + this.subtable.type);
      }
    }
  }, {
    key: 'processIndicRearragement',
    value: function processIndicRearragement(glyph, entry, index) {
      if (entry.flags & MARK_FIRST) {
        this.firstGlyph = index;
      }

      if (entry.flags & MARK_LAST) {
        this.lastGlyph = index;
      }

      reorderGlyphs(this.glyphs, entry.flags & VERB, this.firstGlyph, this.lastGlyph);
    }
  }, {
    key: 'processContextualSubstitution',
    value: function processContextualSubstitution(glyph, entry, index) {
      var subsitutions = this.subtable.table.substitutionTable.items;
      if (entry.markIndex !== 0xffff) {
        var lookup = subsitutions.getItem(entry.markIndex);
        var lookupTable = new AATLookupTable(lookup);
        glyph = this.glyphs[this.markedGlyph];
        var gid = lookupTable.lookup(glyph.id);
        if (gid) {
          this.glyphs[this.markedGlyph] = this.font.getGlyph(gid, glyph.codePoints);
        }
      }

      if (entry.currentIndex !== 0xffff) {
        var _lookup = subsitutions.getItem(entry.currentIndex);
        var _lookupTable = new AATLookupTable(_lookup);
        glyph = this.glyphs[index];
        var gid = _lookupTable.lookup(glyph.id);
        if (gid) {
          this.glyphs[index] = this.font.getGlyph(gid, glyph.codePoints);
        }
      }

      if (entry.flags & SET_MARK) {
        this.markedGlyph = index;
      }
    }
  }, {
    key: 'processLigature',
    value: function processLigature(glyph, entry, index) {
      if (entry.flags & SET_COMPONENT) {
        this.ligatureStack.push(index);
      }

      if (entry.flags & PERFORM_ACTION) {
        var _ligatureStack;

        var actions = this.subtable.table.ligatureActions;
        var components = this.subtable.table.components;
        var ligatureList = this.subtable.table.ligatureList;

        var actionIndex = entry.action;
        var last = false;
        var ligatureIndex = 0;
        var codePoints = [];
        var ligatureGlyphs = [];

        while (!last) {
          var _codePoints;

          var componentGlyph = this.ligatureStack.pop();
          (_codePoints = codePoints).unshift.apply(_codePoints, _toConsumableArray(this.glyphs[componentGlyph].codePoints));

          var action = actions.getItem(actionIndex++);
          last = !!(action & LAST_MASK);
          var store = !!(action & STORE_MASK);
          var offset = (action & OFFSET_MASK) << 2 >> 2; // sign extend 30 to 32 bits
          offset += this.glyphs[componentGlyph].id;

          var component = components.getItem(offset);
          ligatureIndex += component;

          if (last || store) {
            var ligatureEntry = ligatureList.getItem(ligatureIndex);
            this.glyphs[componentGlyph] = this.font.getGlyph(ligatureEntry, codePoints);
            ligatureGlyphs.push(componentGlyph);
            ligatureIndex = 0;
            codePoints = [];
          } else {
            this.glyphs[componentGlyph] = this.font.getGlyph(0xffff);
          }
        }

        // Put ligature glyph indexes back on the stack
        (_ligatureStack = this.ligatureStack).push.apply(_ligatureStack, ligatureGlyphs);
      }
    }
  }, {
    key: 'processNoncontextualSubstitutions',
    value: function processNoncontextualSubstitutions(subtable, glyphs, index) {
      var lookupTable = new AATLookupTable(subtable.table.lookupTable);

      for (index = 0; index < glyphs.length; index++) {
        var glyph = glyphs[index];
        if (glyph.id !== 0xffff) {
          var gid = lookupTable.lookup(glyph.id);
          if (gid) {
            // 0 means do nothing
            glyphs[index] = this.font.getGlyph(gid, glyph.codePoints);
          }
        }
      }
    }
  }, {
    key: '_insertGlyphs',
    value: function _insertGlyphs(glyphIndex, insertionActionIndex, count, isBefore) {
      var _glyphs;

      var insertions = [];
      while (count--) {
        var gid = this.subtable.table.insertionActions.getItem(insertionActionIndex++);
        insertions.push(this.font.getGlyph(gid));
      }

      if (!isBefore) {
        glyphIndex++;
      }

      (_glyphs = this.glyphs).splice.apply(_glyphs, [glyphIndex, 0].concat(insertions));
    }
  }, {
    key: 'processGlyphInsertion',
    value: function processGlyphInsertion(glyph, entry, index) {
      if (entry.flags & SET_MARK) {
        this.markedIndex = index;
      }

      if (entry.markedInsertIndex !== 0xffff) {
        var count = (entry.flags & MARKED_INSERT_COUNT) >>> 5;
        var isBefore = !!(entry.flags & MARKED_INSERT_BEFORE);
        this._insertGlyphs(this.markedIndex, entry.markedInsertIndex, count, isBefore);
      }

      if (entry.currentInsertIndex !== 0xffff) {
        var _count = (entry.flags & CURRENT_INSERT_COUNT) >>> 5;
        var _isBefore = !!(entry.flags & CURRENT_INSERT_BEFORE);
        this._insertGlyphs(index, entry.currentInsertIndex, _count, _isBefore);
      }
    }
  }, {
    key: 'getSupportedFeatures',
    value: function getSupportedFeatures() {
      var features = [];
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = _getIterator(this.morx.chains), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var chain = _step4.value;
          var _iteratorNormalCompletion5 = true;
          var _didIteratorError5 = false;
          var _iteratorError5 = undefined;

          try {
            for (var _iterator5 = _getIterator(chain.features), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
              var feature = _step5.value;

              features.push([feature.featureType, feature.featureSetting]);
            }
          } catch (err) {
            _didIteratorError5 = true;
            _iteratorError5 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion5 && _iterator5.return) {
                _iterator5.return();
              }
            } finally {
              if (_didIteratorError5) {
                throw _iteratorError5;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4.return) {
            _iterator4.return();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }

      return features;
    }
  }, {
    key: 'generateInputs',
    value: function generateInputs(gid) {
      if (!this.inputCache) {
        this.generateInputCache();
      }

      return this.inputCache[gid] || [];
    }
  }, {
    key: 'generateInputCache',
    value: function generateInputCache() {
      this.inputCache = {};

      var _iteratorNormalCompletion6 = true;
      var _didIteratorError6 = false;
      var _iteratorError6 = undefined;

      try {
        for (var _iterator6 = _getIterator(this.morx.chains), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
          var chain = _step6.value;

          var flags = chain.defaultFlags;

          var _iteratorNormalCompletion7 = true;
          var _didIteratorError7 = false;
          var _iteratorError7 = undefined;

          try {
            for (var _iterator7 = _getIterator(chain.subtables), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
              var subtable = _step7.value;

              if (subtable.subFeatureFlags & flags) {
                this.generateInputsForSubtable(subtable);
              }
            }
          } catch (err) {
            _didIteratorError7 = true;
            _iteratorError7 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion7 && _iterator7.return) {
                _iterator7.return();
              }
            } finally {
              if (_didIteratorError7) {
                throw _iteratorError7;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError6 = true;
        _iteratorError6 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion6 && _iterator6.return) {
            _iterator6.return();
          }
        } finally {
          if (_didIteratorError6) {
            throw _iteratorError6;
          }
        }
      }
    }
  }, {
    key: 'generateInputsForSubtable',
    value: function generateInputsForSubtable(subtable) {
      var _this = this;

      // Currently, only supporting ligature subtables.
      if (subtable.type !== 2) {
        return;
      }

      var reverse = !!(subtable.coverage & REVERSE_DIRECTION);
      if (reverse) {
        throw new Error('Reverse subtable, not supported.');
      }

      this.subtable = subtable;
      this.ligatureStack = [];

      var stateMachine = this.getStateMachine(subtable);
      var process = this.getProcessor();

      var input = [];
      var stack = [];
      this.glyphs = [];

      stateMachine.traverse({
        enter: function enter(glyph, entry) {
          var glyphs = _this.glyphs;
          stack.push({
            glyphs: glyphs.slice(),
            ligatureStack: _this.ligatureStack.slice()
          });

          // Add glyph to input and glyphs to process.
          var g = _this.font.getGlyph(glyph);
          input.push(g);
          glyphs.push(input[input.length - 1]);

          // Process ligature substitution
          process(glyphs[glyphs.length - 1], entry, glyphs.length - 1);

          // Add input to result if only one matching (non-deleted) glyph remains.
          var count = 0;
          var found = 0;
          for (var i = 0; i < glyphs.length && count <= 1; i++) {
            if (glyphs[i].id !== 0xffff) {
              count++;
              found = glyphs[i].id;
            }
          }

          if (count === 1) {
            var result = input.map(function (g) {
              return g.id;
            });
            var _cache = _this.inputCache[found];
            if (_cache) {
              _cache.push(result);
            } else {
              _this.inputCache[found] = [result];
            }
          }
        },

        exit: function exit() {
          var _stack$pop = stack.pop();

          _this.glyphs = _stack$pop.glyphs;
          _this.ligatureStack = _stack$pop.ligatureStack;

          input.pop();
        }
      });
    }
  }]);

  return AATMorxProcessor;
}(), (_applyDecoratedDescriptor$2(_class$2.prototype, 'getStateMachine', [cache], _Object$getOwnPropertyDescriptor(_class$2.prototype, 'getStateMachine'), _class$2.prototype)), _class$2);

function swap(glyphs, rangeA, rangeB) {
  var reverseA = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
  var reverseB = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;

  var end = glyphs.splice(rangeB[0] - (rangeB[1] - 1), rangeB[1]);
  if (reverseB) {
    end.reverse();
  }

  var start = glyphs.splice.apply(glyphs, [rangeA[0], rangeA[1]].concat(_toConsumableArray(end)));
  if (reverseA) {
    start.reverse();
  }

  glyphs.splice.apply(glyphs, [rangeB[0] - (rangeA[1] - 1), 0].concat(_toConsumableArray(start)));
  return glyphs;
}

function reorderGlyphs(glyphs, verb, firstGlyph, lastGlyph) {
  var length = lastGlyph - firstGlyph + 1;
  switch (verb) {
    case 0:
      // no change
      return glyphs;

    case 1:
      // Ax => xA
      return swap(glyphs, [firstGlyph, 1], [lastGlyph, 0]);

    case 2:
      // xD => Dx
      return swap(glyphs, [firstGlyph, 0], [lastGlyph, 1]);

    case 3:
      // AxD => DxA
      return swap(glyphs, [firstGlyph, 1], [lastGlyph, 1]);

    case 4:
      // ABx => xAB
      return swap(glyphs, [firstGlyph, 2], [lastGlyph, 0]);

    case 5:
      // ABx => xBA
      return swap(glyphs, [firstGlyph, 2], [lastGlyph, 0], true, false);

    case 6:
      // xCD => CDx
      return swap(glyphs, [firstGlyph, 0], [lastGlyph, 2]);

    case 7:
      // xCD => DCx
      return swap(glyphs, [firstGlyph, 0], [lastGlyph, 2], false, true);

    case 8:
      // AxCD => CDxA
      return swap(glyphs, [firstGlyph, 1], [lastGlyph, 2]);

    case 9:
      // AxCD => DCxA
      return swap(glyphs, [firstGlyph, 1], [lastGlyph, 2], false, true);

    case 10:
      // ABxD => DxAB
      return swap(glyphs, [firstGlyph, 2], [lastGlyph, 1]);

    case 11:
      // ABxD => DxBA
      return swap(glyphs, [firstGlyph, 2], [lastGlyph, 1], true, false);

    case 12:
      // ABxCD => CDxAB
      return swap(glyphs, [firstGlyph, 2], [lastGlyph, 2]);

    case 13:
      // ABxCD => CDxBA
      return swap(glyphs, [firstGlyph, 2], [lastGlyph, 2], true, false);

    case 14:
      // ABxCD => DCxAB
      return swap(glyphs, [firstGlyph, 2], [lastGlyph, 2], false, true);

    case 15:
      // ABxCD => DCxBA
      return swap(glyphs, [firstGlyph, 2], [lastGlyph, 2], true, true);

    default:
      throw new Error('Unknown verb: ' + verb);
  }
}

var AATLayoutEngine = function () {
  function AATLayoutEngine(font) {
    _classCallCheck(this, AATLayoutEngine);

    this.font = font;
    this.morxProcessor = new AATMorxProcessor(font);
  }

  _createClass(AATLayoutEngine, [{
    key: 'substitute',
    value: function substitute(glyphs, features, script, language) {
      // AAT expects the glyphs to be in visual order prior to morx processing,
      // so reverse the glyphs if the script is right-to-left.
      var isRTL = direction(script) === 'rtl';
      if (isRTL) {
        glyphs.reverse();
      }

      this.morxProcessor.process(glyphs, mapOTToAAT(features));
      return glyphs;
    }
  }, {
    key: 'getAvailableFeatures',
    value: function getAvailableFeatures(script, language) {
      return mapAATToOT(this.morxProcessor.getSupportedFeatures());
    }
  }, {
    key: 'stringsForGlyph',
    value: function stringsForGlyph(gid) {
      var glyphStrings = this.morxProcessor.generateInputs(gid);
      var result = new _Set();

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(glyphStrings), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var glyphs = _step.value;

          this._addStrings(glyphs, 0, result, '');
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return result;
    }
  }, {
    key: '_addStrings',
    value: function _addStrings(glyphs, index, strings, string) {
      var codePoints = this.font._cmapProcessor.codePointsForGlyph(glyphs[index]);

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(codePoints), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var codePoint = _step2.value;

          var s = string + _String$fromCodePoint(codePoint);
          if (index < glyphs.length - 1) {
            this._addStrings(glyphs, index + 1, strings, s);
          } else {
            strings.add(s);
          }
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }
    }
  }]);

  return AATLayoutEngine;
}();

/**
 * ShapingPlans are used by the OpenType shapers to store which
 * features should by applied, and in what order to apply them.
 * The features are applied in groups called stages. A feature
 * can be applied globally to all glyphs, or locally to only
 * specific glyphs.
 *
 * @private
 */

var ShapingPlan = function () {
  function ShapingPlan(font, script, language) {
    _classCallCheck(this, ShapingPlan);

    this.font = font;
    this.script = script;
    this.language = language;
    this.direction = direction(script);
    this.stages = [];
    this.globalFeatures = {};
    this.allFeatures = {};
  }

  /**
   * Adds the given features to the last stage.
   * Ignores features that have already been applied.
   */


  _createClass(ShapingPlan, [{
    key: '_addFeatures',
    value: function _addFeatures(features) {
      var stage = this.stages[this.stages.length - 1];
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(features), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var feature = _step.value;

          if (!this.allFeatures[feature]) {
            stage.push(feature);
            this.allFeatures[feature] = true;
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }

    /**
     * Adds the given features to the global list
     */

  }, {
    key: '_addGlobal',
    value: function _addGlobal(features) {
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(features), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var feature = _step2.value;

          this.globalFeatures[feature] = true;
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }
    }

    /**
     * Add features to the last stage
     */

  }, {
    key: 'add',
    value: function add(arg) {
      var global = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

      if (this.stages.length === 0) {
        this.stages.push([]);
      }

      if (typeof arg === 'string') {
        arg = [arg];
      }

      if (Array.isArray(arg)) {
        this._addFeatures(arg);
        if (global) {
          this._addGlobal(arg);
        }
      } else if ((typeof arg === 'undefined' ? 'undefined' : _typeof(arg)) === 'object') {
        var features = (arg.global || []).concat(arg.local || []);
        this._addFeatures(features);
        if (arg.global) {
          this._addGlobal(arg.global);
        }
      } else {
        throw new Error("Unsupported argument to ShapingPlan#add");
      }
    }

    /**
     * Add a new stage
     */

  }, {
    key: 'addStage',
    value: function addStage(arg, global) {
      if (typeof arg === 'function') {
        this.stages.push(arg, []);
      } else {
        this.stages.push([]);
        this.add(arg, global);
      }
    }

    /**
     * Assigns the global features to the given glyphs
     */

  }, {
    key: 'assignGlobalFeatures',
    value: function assignGlobalFeatures(glyphs) {
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = _getIterator(glyphs), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var glyph = _step3.value;

          for (var feature in this.globalFeatures) {
            glyph.features[feature] = true;
          }
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3.return) {
            _iterator3.return();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }
    }

    /**
     * Executes the planned stages using the given OTProcessor
     */

  }, {
    key: 'process',
    value: function process(processor, glyphs, positions) {
      processor.selectScript(this.script, this.language);

      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = _getIterator(this.stages), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var stage = _step4.value;

          if (typeof stage === 'function') {
            if (!positions) {
              stage(this.font, glyphs, positions);
            }
          } else if (stage.length > 0) {
            processor.applyFeatures(stage, glyphs, positions);
          }
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4.return) {
            _iterator4.return();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }
    }
  }]);

  return ShapingPlan;
}();

var _class$4;
var _temp;
var COMMON_FEATURES = ['ccmp', 'locl', 'rlig', 'mark', 'mkmk'];
var FRACTIONAL_FEATURES = ['frac', 'numr', 'dnom'];
var HORIZONTAL_FEATURES = ['calt', 'clig', 'liga', 'rclt', 'curs', 'kern'];
var DIRECTIONAL_FEATURES = {
  ltr: ['ltra', 'ltrm'],
  rtl: ['rtla', 'rtlm']
};

var DefaultShaper = (_temp = _class$4 = function () {
  function DefaultShaper() {
    _classCallCheck(this, DefaultShaper);
  }

  _createClass(DefaultShaper, null, [{
    key: 'plan',
    value: function plan(_plan, glyphs, features) {
      // Plan the features we want to apply
      this.planPreprocessing(_plan);
      this.planFeatures(_plan);
      this.planPostprocessing(_plan, features);

      // Assign the global features to all the glyphs
      _plan.assignGlobalFeatures(glyphs);

      // Assign local features to glyphs
      this.assignFeatures(_plan, glyphs);
    }
  }, {
    key: 'planPreprocessing',
    value: function planPreprocessing(plan) {
      plan.add({
        global: DIRECTIONAL_FEATURES[plan.direction],
        local: FRACTIONAL_FEATURES
      });
    }
  }, {
    key: 'planFeatures',
    value: function planFeatures(plan) {
      // Do nothing by default. Let subclasses override this.
    }
  }, {
    key: 'planPostprocessing',
    value: function planPostprocessing(plan, userFeatures) {
      plan.add([].concat(COMMON_FEATURES, HORIZONTAL_FEATURES, _toConsumableArray(userFeatures)));
    }
  }, {
    key: 'assignFeatures',
    value: function assignFeatures(plan, glyphs) {
      // Enable contextual fractions
      var i = 0;
      while (i < glyphs.length) {
        var glyph = glyphs[i];
        if (glyph.codePoints[0] === 0x2044) {
          // fraction slash
          var start = i - 1;
          var end = i + 1;

          // Apply numerator
          while (start >= 0 && unicode.isDigit(glyphs[start].codePoints[0])) {
            glyphs[start].features.numr = true;
            glyphs[start].features.frac = true;
            start--;
          }

          // Apply denominator
          while (end < glyphs.length && unicode.isDigit(glyphs[end].codePoints[0])) {
            glyphs[end].features.dnom = true;
            glyphs[end].features.frac = true;
            end++;
          }

          // Apply fraction slash
          glyph.features.frac = true;
          i = end - 1;
        } else {
          i++;
        }
      }
    }
  }]);

  return DefaultShaper;
}(), _class$4.zeroMarkWidths = 'AFTER_GPOS', _temp);

var trie = new UnicodeTrie(require('fs').readFileSync(__dirname + '/data.trie'));
var FEATURES = ['isol', 'fina', 'fin2', 'fin3', 'medi', 'med2', 'init'];

var ShapingClasses = {
  Non_Joining: 0,
  Left_Joining: 1,
  Right_Joining: 2,
  Dual_Joining: 3,
  Join_Causing: 3,
  ALAPH: 4,
  'DALATH RISH': 5,
  Transparent: 6
};

var ISOL = 'isol';
var FINA = 'fina';
var FIN2 = 'fin2';
var FIN3 = 'fin3';
var MEDI = 'medi';
var MED2 = 'med2';
var INIT = 'init';
var NONE = null;

// Each entry is [prevAction, curAction, nextState]
var STATE_TABLE = [
//   Non_Joining,        Left_Joining,       Right_Joining,     Dual_Joining,           ALAPH,            DALATH RISH
// State 0: prev was U,  not willing to join.
[[NONE, NONE, 0], [NONE, ISOL, 2], [NONE, ISOL, 1], [NONE, ISOL, 2], [NONE, ISOL, 1], [NONE, ISOL, 6]],

// State 1: prev was R or ISOL/ALAPH,  not willing to join.
[[NONE, NONE, 0], [NONE, ISOL, 2], [NONE, ISOL, 1], [NONE, ISOL, 2], [NONE, FIN2, 5], [NONE, ISOL, 6]],

// State 2: prev was D/L in ISOL form,  willing to join.
[[NONE, NONE, 0], [NONE, ISOL, 2], [INIT, FINA, 1], [INIT, FINA, 3], [INIT, FINA, 4], [INIT, FINA, 6]],

// State 3: prev was D in FINA form,  willing to join.
[[NONE, NONE, 0], [NONE, ISOL, 2], [MEDI, FINA, 1], [MEDI, FINA, 3], [MEDI, FINA, 4], [MEDI, FINA, 6]],

// State 4: prev was FINA ALAPH,  not willing to join.
[[NONE, NONE, 0], [NONE, ISOL, 2], [MED2, ISOL, 1], [MED2, ISOL, 2], [MED2, FIN2, 5], [MED2, ISOL, 6]],

// State 5: prev was FIN2/FIN3 ALAPH,  not willing to join.
[[NONE, NONE, 0], [NONE, ISOL, 2], [ISOL, ISOL, 1], [ISOL, ISOL, 2], [ISOL, FIN2, 5], [ISOL, ISOL, 6]],

// State 6: prev was DALATH/RISH,  not willing to join.
[[NONE, NONE, 0], [NONE, ISOL, 2], [NONE, ISOL, 1], [NONE, ISOL, 2], [NONE, FIN3, 5], [NONE, ISOL, 6]]];

/**
 * This is a shaper for Arabic, and other cursive scripts.
 * It uses data from ArabicShaping.txt in the Unicode database,
 * compiled to a UnicodeTrie by generate-data.coffee.
 *
 * The shaping state machine was ported from Harfbuzz.
 * https://github.com/behdad/harfbuzz/blob/master/src/hb-ot-shape-complex-arabic.cc
 */

var ArabicShaper = function (_DefaultShaper) {
  _inherits(ArabicShaper, _DefaultShaper);

  function ArabicShaper() {
    _classCallCheck(this, ArabicShaper);

    return _possibleConstructorReturn(this, (ArabicShaper.__proto__ || _Object$getPrototypeOf(ArabicShaper)).apply(this, arguments));
  }

  _createClass(ArabicShaper, null, [{
    key: 'planFeatures',
    value: function planFeatures(plan) {
      plan.add(['ccmp', 'locl']);
      for (var i = 0; i < FEATURES.length; i++) {
        var feature = FEATURES[i];
        plan.addStage(feature, false);
      }

      plan.addStage('mset');
    }
  }, {
    key: 'assignFeatures',
    value: function assignFeatures(plan, glyphs) {
      _get(ArabicShaper.__proto__ || _Object$getPrototypeOf(ArabicShaper), 'assignFeatures', this).call(this, plan, glyphs);

      var prev = -1;
      var state = 0;
      var actions = [];

      // Apply the state machine to map glyphs to features
      for (var i = 0; i < glyphs.length; i++) {
        var curAction = void 0,
            prevAction = void 0;
        var glyph = glyphs[i];
        var type = getShapingClass(glyph.codePoints[0]);
        if (type === ShapingClasses.Transparent) {
          actions[i] = NONE;
          continue;
        }

        var _STATE_TABLE$state$ty = _slicedToArray(STATE_TABLE[state][type], 3);

        prevAction = _STATE_TABLE$state$ty[0];
        curAction = _STATE_TABLE$state$ty[1];
        state = _STATE_TABLE$state$ty[2];


        if (prevAction !== NONE && prev !== -1) {
          actions[prev] = prevAction;
        }

        actions[i] = curAction;
        prev = i;
      }

      // Apply the chosen features to their respective glyphs
      for (var index = 0; index < glyphs.length; index++) {
        var feature = void 0;
        var glyph = glyphs[index];
        if (feature = actions[index]) {
          glyph.features[feature] = true;
        }
      }
    }
  }]);

  return ArabicShaper;
}(DefaultShaper);

function getShapingClass(codePoint) {
  var res = trie.get(codePoint);
  if (res) {
    return res - 1;
  }

  var category = unicode.getCategory(codePoint);
  if (category === 'Mn' || category === 'Me' || category === 'Cf') {
    return ShapingClasses.Transparent;
  }

  return ShapingClasses.Non_Joining;
}

var GlyphIterator = function () {
  function GlyphIterator(glyphs, flags) {
    _classCallCheck(this, GlyphIterator);

    this.glyphs = glyphs;
    this.reset(flags);
  }

  _createClass(GlyphIterator, [{
    key: "reset",
    value: function reset() {
      var flags = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      this.flags = flags;
      this.index = 0;
    }
  }, {
    key: "shouldIgnore",
    value: function shouldIgnore(glyph, flags) {
      return flags.ignoreMarks && glyph.isMark || flags.ignoreBaseGlyphs && !glyph.isMark || flags.ignoreLigatures && glyph.isLigature;
    }
  }, {
    key: "move",
    value: function move(dir) {
      this.index += dir;
      while (0 <= this.index && this.index < this.glyphs.length && this.shouldIgnore(this.glyphs[this.index], this.flags)) {
        this.index += dir;
      }

      if (0 > this.index || this.index >= this.glyphs.length) {
        return null;
      }

      return this.glyphs[this.index];
    }
  }, {
    key: "next",
    value: function next() {
      return this.move(+1);
    }
  }, {
    key: "prev",
    value: function prev() {
      return this.move(-1);
    }
  }, {
    key: "peek",
    value: function peek() {
      var count = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;

      var idx = this.index;
      var res = this.increment(count);
      this.index = idx;
      return res;
    }
  }, {
    key: "peekIndex",
    value: function peekIndex() {
      var count = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;

      var idx = this.index;
      this.increment(count);
      var res = this.index;
      this.index = idx;
      return res;
    }
  }, {
    key: "increment",
    value: function increment() {
      var count = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;

      var dir = count < 0 ? -1 : 1;
      count = Math.abs(count);
      while (count--) {
        this.move(dir);
      }

      return this.glyphs[this.index];
    }
  }, {
    key: "cur",
    get: function get() {
      return this.glyphs[this.index] || null;
    }
  }]);

  return GlyphIterator;
}();

var DEFAULT_SCRIPTS = ['DFLT', 'dflt', 'latn'];

var OTProcessor = function () {
  function OTProcessor(font, table) {
    _classCallCheck(this, OTProcessor);

    this.font = font;
    this.table = table;

    this.script = null;
    this.scriptTag = null;

    this.language = null;
    this.languageTag = null;

    this.features = {};
    this.lookups = {};

    // initialize to default script + language
    this.selectScript();

    // current context (set by applyFeatures)
    this.glyphs = [];
    this.positions = []; // only used by GPOS
    this.ligatureID = 1;
  }

  _createClass(OTProcessor, [{
    key: 'findScript',
    value: function findScript(script) {
      if (this.table.scriptList == null) {
        return null;
      }

      if (!Array.isArray(script)) {
        script = [script];
      }

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(this.table.scriptList), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var entry = _step.value;
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = _getIterator(script), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var s = _step2.value;

              if (entry.tag === s) {
                return entry;
              }
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2.return) {
                _iterator2.return();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return null;
    }
  }, {
    key: 'selectScript',
    value: function selectScript(script, language) {
      var changed = false;
      var entry = void 0;
      if (!this.script || script !== this.scriptTag) {
        entry = this.findScript(script);
        if (script) {
          entry = this.findScript(script);
        }

        if (!entry) {
          entry = this.findScript(DEFAULT_SCRIPTS);
        }

        if (!entry) {
          return;
        }

        this.scriptTag = entry.tag;
        this.script = entry.script;
        this.direction = direction(script);
        this.language = null;
        changed = true;
      }

      if (!language && language !== this.langugeTag) {
        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = _getIterator(this.script.langSysRecords), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            var lang = _step3.value;

            if (lang.tag === language) {
              this.language = lang.langSys;
              this.langugeTag = lang.tag;
              changed = true;
              break;
            }
          }
        } catch (err) {
          _didIteratorError3 = true;
          _iteratorError3 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion3 && _iterator3.return) {
              _iterator3.return();
            }
          } finally {
            if (_didIteratorError3) {
              throw _iteratorError3;
            }
          }
        }
      }

      if (!this.language) {
        this.language = this.script.defaultLangSys;
      }

      // Build a feature lookup table
      if (changed) {
        this.features = {};
        if (this.language) {
          var _iteratorNormalCompletion4 = true;
          var _didIteratorError4 = false;
          var _iteratorError4 = undefined;

          try {
            for (var _iterator4 = _getIterator(this.language.featureIndexes), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
              var featureIndex = _step4.value;

              var record = this.table.featureList[featureIndex];
              this.features[record.tag] = record.feature;
            }
          } catch (err) {
            _didIteratorError4 = true;
            _iteratorError4 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion4 && _iterator4.return) {
                _iterator4.return();
              }
            } finally {
              if (_didIteratorError4) {
                throw _iteratorError4;
              }
            }
          }
        }
      }
    }
  }, {
    key: 'lookupsForFeatures',
    value: function lookupsForFeatures() {
      var userFeatures = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
      var exclude = arguments[1];

      var lookups = [];
      var _iteratorNormalCompletion5 = true;
      var _didIteratorError5 = false;
      var _iteratorError5 = undefined;

      try {
        for (var _iterator5 = _getIterator(userFeatures), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
          var tag = _step5.value;

          var feature = this.features[tag];
          if (!feature) {
            continue;
          }

          var _iteratorNormalCompletion6 = true;
          var _didIteratorError6 = false;
          var _iteratorError6 = undefined;

          try {
            for (var _iterator6 = _getIterator(feature.lookupListIndexes), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
              var lookupIndex = _step6.value;

              if (exclude && exclude.indexOf(lookupIndex) !== -1) {
                continue;
              }

              lookups.push({
                feature: tag,
                index: lookupIndex,
                lookup: this.table.lookupList.get(lookupIndex)
              });
            }
          } catch (err) {
            _didIteratorError6 = true;
            _iteratorError6 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion6 && _iterator6.return) {
                _iterator6.return();
              }
            } finally {
              if (_didIteratorError6) {
                throw _iteratorError6;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError5 = true;
        _iteratorError5 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion5 && _iterator5.return) {
            _iterator5.return();
          }
        } finally {
          if (_didIteratorError5) {
            throw _iteratorError5;
          }
        }
      }

      lookups.sort(function (a, b) {
        return a.index - b.index;
      });
      return lookups;
    }
  }, {
    key: 'applyFeatures',
    value: function applyFeatures(userFeatures, glyphs, advances) {
      var lookups = this.lookupsForFeatures(userFeatures);
      this.applyLookups(lookups, glyphs, advances);
    }
  }, {
    key: 'applyLookups',
    value: function applyLookups(lookups, glyphs, positions) {
      this.glyphs = glyphs;
      this.positions = positions;
      this.glyphIterator = new GlyphIterator(glyphs);

      var _iteratorNormalCompletion7 = true;
      var _didIteratorError7 = false;
      var _iteratorError7 = undefined;

      try {
        for (var _iterator7 = _getIterator(lookups), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
          var _step7$value = _step7.value,
              feature = _step7$value.feature,
              lookup = _step7$value.lookup;

          this.glyphIterator.reset(lookup.flags);

          while (this.glyphIterator.index < glyphs.length) {
            if (!(feature in this.glyphIterator.cur.features)) {
              this.glyphIterator.next();
              continue;
            }

            var _iteratorNormalCompletion8 = true;
            var _didIteratorError8 = false;
            var _iteratorError8 = undefined;

            try {
              for (var _iterator8 = _getIterator(lookup.subTables), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
                var table = _step8.value;

                var res = this.applyLookup(lookup.lookupType, table);
                if (res) {
                  break;
                }
              }
            } catch (err) {
              _didIteratorError8 = true;
              _iteratorError8 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion8 && _iterator8.return) {
                  _iterator8.return();
                }
              } finally {
                if (_didIteratorError8) {
                  throw _iteratorError8;
                }
              }
            }

            this.glyphIterator.next();
          }
        }
      } catch (err) {
        _didIteratorError7 = true;
        _iteratorError7 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion7 && _iterator7.return) {
            _iterator7.return();
          }
        } finally {
          if (_didIteratorError7) {
            throw _iteratorError7;
          }
        }
      }
    }
  }, {
    key: 'applyLookup',
    value: function applyLookup(lookup, table) {
      throw new Error("applyLookup must be implemented by subclasses");
    }
  }, {
    key: 'applyLookupList',
    value: function applyLookupList(lookupRecords) {
      var glyphIndex = this.glyphIterator.index;

      var _iteratorNormalCompletion9 = true;
      var _didIteratorError9 = false;
      var _iteratorError9 = undefined;

      try {
        for (var _iterator9 = _getIterator(lookupRecords), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
          var lookupRecord = _step9.value;

          this.glyphIterator.index = glyphIndex;
          this.glyphIterator.increment(lookupRecord.sequenceIndex);

          var lookup = this.table.lookupList.get(lookupRecord.lookupListIndex);
          var _iteratorNormalCompletion10 = true;
          var _didIteratorError10 = false;
          var _iteratorError10 = undefined;

          try {
            for (var _iterator10 = _getIterator(lookup.subTables), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
              var table = _step10.value;

              this.applyLookup(lookup.lookupType, table);
            }
          } catch (err) {
            _didIteratorError10 = true;
            _iteratorError10 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion10 && _iterator10.return) {
                _iterator10.return();
              }
            } finally {
              if (_didIteratorError10) {
                throw _iteratorError10;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError9 = true;
        _iteratorError9 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion9 && _iterator9.return) {
            _iterator9.return();
          }
        } finally {
          if (_didIteratorError9) {
            throw _iteratorError9;
          }
        }
      }

      this.glyphIterator.index = glyphIndex;
      return true;
    }
  }, {
    key: 'coverageIndex',
    value: function coverageIndex(coverage, glyph) {
      if (glyph == null) {
        glyph = this.glyphIterator.cur.id;
      }

      switch (coverage.version) {
        case 1:
          return coverage.glyphs.indexOf(glyph);

        case 2:
          var _iteratorNormalCompletion11 = true;
          var _didIteratorError11 = false;
          var _iteratorError11 = undefined;

          try {
            for (var _iterator11 = _getIterator(coverage.rangeRecords), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
              var range = _step11.value;

              if (range.start <= glyph && glyph <= range.end) {
                return range.startCoverageIndex + glyph - range.start;
              }
            }
          } catch (err) {
            _didIteratorError11 = true;
            _iteratorError11 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion11 && _iterator11.return) {
                _iterator11.return();
              }
            } finally {
              if (_didIteratorError11) {
                throw _iteratorError11;
              }
            }
          }

          break;
      }

      return -1;
    }
  }, {
    key: 'match',
    value: function match(sequenceIndex, sequence, fn, matched) {
      var pos = this.glyphIterator.index;
      var glyph = this.glyphIterator.increment(sequenceIndex);
      var idx = 0;

      while (idx < sequence.length && glyph && fn(sequence[idx], glyph.id)) {
        if (matched) {
          matched.push(this.glyphIterator.index);
        }

        idx++;
        glyph = this.glyphIterator.next();
      }

      this.glyphIterator.index = pos;
      if (idx < sequence.length) {
        return false;
      }

      return matched || true;
    }
  }, {
    key: 'sequenceMatches',
    value: function sequenceMatches(sequenceIndex, sequence) {
      return this.match(sequenceIndex, sequence, function (component, glyph) {
        return component === glyph;
      });
    }
  }, {
    key: 'sequenceMatchIndices',
    value: function sequenceMatchIndices(sequenceIndex, sequence) {
      return this.match(sequenceIndex, sequence, function (component, glyph) {
        return component === glyph;
      }, []);
    }
  }, {
    key: 'coverageSequenceMatches',
    value: function coverageSequenceMatches(sequenceIndex, sequence) {
      var _this = this;

      return this.match(sequenceIndex, sequence, function (coverage, glyph) {
        return _this.coverageIndex(coverage, glyph) >= 0;
      });
    }
  }, {
    key: 'getClassID',
    value: function getClassID(glyph, classDef) {
      switch (classDef.version) {
        case 1:
          // Class array
          var i = glyph - classDef.startGlyph;
          if (i < classDef.classValueArray.length) {
            return classDef.classValueArray[i];
          }

          break;

        case 2:
          var _iteratorNormalCompletion12 = true;
          var _didIteratorError12 = false;
          var _iteratorError12 = undefined;

          try {
            for (var _iterator12 = _getIterator(classDef.classRangeRecord), _step12; !(_iteratorNormalCompletion12 = (_step12 = _iterator12.next()).done); _iteratorNormalCompletion12 = true) {
              var range = _step12.value;

              if (range.start <= glyph && glyph <= range.end) {
                return range.class;
              }
            }
          } catch (err) {
            _didIteratorError12 = true;
            _iteratorError12 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion12 && _iterator12.return) {
                _iterator12.return();
              }
            } finally {
              if (_didIteratorError12) {
                throw _iteratorError12;
              }
            }
          }

          break;
      }

      return 0;
    }
  }, {
    key: 'classSequenceMatches',
    value: function classSequenceMatches(sequenceIndex, sequence, classDef) {
      var _this2 = this;

      return this.match(sequenceIndex, sequence, function (classID, glyph) {
        return classID === _this2.getClassID(glyph, classDef);
      });
    }
  }, {
    key: 'applyContext',
    value: function applyContext(table) {
      switch (table.version) {
        case 1:
          var index = this.coverageIndex(table.coverage);
          if (index === -1) {
            return false;
          }

          var set = table.ruleSets[index];
          var _iteratorNormalCompletion13 = true;
          var _didIteratorError13 = false;
          var _iteratorError13 = undefined;

          try {
            for (var _iterator13 = _getIterator(set), _step13; !(_iteratorNormalCompletion13 = (_step13 = _iterator13.next()).done); _iteratorNormalCompletion13 = true) {
              var rule = _step13.value;

              if (this.sequenceMatches(1, rule.input)) {
                return this.applyLookupList(rule.lookupRecords);
              }
            }
          } catch (err) {
            _didIteratorError13 = true;
            _iteratorError13 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion13 && _iterator13.return) {
                _iterator13.return();
              }
            } finally {
              if (_didIteratorError13) {
                throw _iteratorError13;
              }
            }
          }

          break;

        case 2:
          if (this.coverageIndex(table.coverage) === -1) {
            return false;
          }

          index = this.getClassID(this.glyphIterator.cur.id, table.classDef);
          if (index === -1) {
            return false;
          }

          set = table.classSet[index];
          var _iteratorNormalCompletion14 = true;
          var _didIteratorError14 = false;
          var _iteratorError14 = undefined;

          try {
            for (var _iterator14 = _getIterator(set), _step14; !(_iteratorNormalCompletion14 = (_step14 = _iterator14.next()).done); _iteratorNormalCompletion14 = true) {
              var _rule = _step14.value;

              if (this.classSequenceMatches(1, _rule.classes, table.classDef)) {
                return this.applyLookupList(_rule.lookupRecords);
              }
            }
          } catch (err) {
            _didIteratorError14 = true;
            _iteratorError14 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion14 && _iterator14.return) {
                _iterator14.return();
              }
            } finally {
              if (_didIteratorError14) {
                throw _iteratorError14;
              }
            }
          }

          break;

        case 3:
          if (this.coverageSequenceMatches(0, table.coverages)) {
            return this.applyLookupList(table.lookupRecords);
          }

          break;
      }

      return false;
    }
  }, {
    key: 'applyChainingContext',
    value: function applyChainingContext(table) {
      switch (table.version) {
        case 1:
          var index = this.coverageIndex(table.coverage);
          if (index === -1) {
            return false;
          }

          var set = table.chainRuleSets[index];
          var _iteratorNormalCompletion15 = true;
          var _didIteratorError15 = false;
          var _iteratorError15 = undefined;

          try {
            for (var _iterator15 = _getIterator(set), _step15; !(_iteratorNormalCompletion15 = (_step15 = _iterator15.next()).done); _iteratorNormalCompletion15 = true) {
              var rule = _step15.value;

              if (this.sequenceMatches(-rule.backtrack.length, rule.backtrack) && this.sequenceMatches(1, rule.input) && this.sequenceMatches(1 + rule.input.length, rule.lookahead)) {
                return this.applyLookupList(rule.lookupRecords);
              }
            }
          } catch (err) {
            _didIteratorError15 = true;
            _iteratorError15 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion15 && _iterator15.return) {
                _iterator15.return();
              }
            } finally {
              if (_didIteratorError15) {
                throw _iteratorError15;
              }
            }
          }

          break;

        case 2:
          if (this.coverageIndex(table.coverage) === -1) {
            return false;
          }

          index = this.getClassID(this.glyphIterator.cur.id, table.inputClassDef);
          var rules = table.chainClassSet[index];
          if (!rules) {
            return false;
          }

          var _iteratorNormalCompletion16 = true;
          var _didIteratorError16 = false;
          var _iteratorError16 = undefined;

          try {
            for (var _iterator16 = _getIterator(rules), _step16; !(_iteratorNormalCompletion16 = (_step16 = _iterator16.next()).done); _iteratorNormalCompletion16 = true) {
              var _rule2 = _step16.value;

              if (this.classSequenceMatches(-_rule2.backtrack.length, _rule2.backtrack, table.backtrackClassDef) && this.classSequenceMatches(1, _rule2.input, table.inputClassDef) && this.classSequenceMatches(1 + _rule2.input.length, _rule2.lookahead, table.lookaheadClassDef)) {
                return this.applyLookupList(_rule2.lookupRecords);
              }
            }
          } catch (err) {
            _didIteratorError16 = true;
            _iteratorError16 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion16 && _iterator16.return) {
                _iterator16.return();
              }
            } finally {
              if (_didIteratorError16) {
                throw _iteratorError16;
              }
            }
          }

          break;

        case 3:
          if (this.coverageSequenceMatches(-table.backtrackGlyphCount, table.backtrackCoverage) && this.coverageSequenceMatches(0, table.inputCoverage) && this.coverageSequenceMatches(table.inputGlyphCount, table.lookaheadCoverage)) {
            return this.applyLookupList(table.lookupRecords);
          }

          break;
      }

      return false;
    }
  }]);

  return OTProcessor;
}();

var GlyphInfo = function () {
  function GlyphInfo(font, id) {
    var codePoints = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
    var features = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];

    _classCallCheck(this, GlyphInfo);

    this._font = font;
    this.codePoints = codePoints;
    this.id = id;

    this.features = {};
    if (Array.isArray(features)) {
      for (var i = 0; i < features.length; i++) {
        var feature = features[i];
        this.features[feature] = true;
      }
    } else if ((typeof features === 'undefined' ? 'undefined' : _typeof(features)) === 'object') {
      _Object$assign(this.features, features);
    }

    this.ligatureID = null;
    this.ligatureComponent = null;
    this.ligated = false;
    this.cursiveAttachment = null;
    this.markAttachment = null;
    this.shaperInfo = null;
    this.substituted = false;
  }

  _createClass(GlyphInfo, [{
    key: 'id',
    get: function get() {
      return this._id;
    },
    set: function set(id) {
      this._id = id;
      this.substituted = true;

      if (this._font.GDEF) {
        // TODO: clean this up
        var classID = OTProcessor.prototype.getClassID(id, this._font.GDEF.glyphClassDef);
        this.isMark = classID === 3;
        this.isLigature = classID === 2;
      } else {
        this.isMark = this.codePoints.every(unicode.isMark);
        this.isLigature = this.codePoints.length > 1;
      }
    }
  }]);

  return GlyphInfo;
}();

var _class$5;
var _temp$1;
/**
 * This is a shaper for the Hangul script, used by the Korean language.
 * It does the following:
 *   - decompose if unsupported by the font:
 *     <LV>   -> <L,V>
 *     <LVT>  -> <L,V,T>
 *     <LV,T> -> <L,V,T>
 *
 *   - compose if supported by the font:
 *     <L,V>   -> <LV>
 *     <L,V,T> -> <LVT>
 *     <LV,T>  -> <LVT>
 *
 *   - reorder tone marks (S is any valid syllable):
 *     <S, M> -> <M, S>
 *
 *   - apply ljmo, vjmo, and tjmo OpenType features to decomposed Jamo sequences.
 *
 * This logic is based on the following documents:
 *   - http://www.microsoft.com/typography/OpenTypeDev/hangul/intro.htm
 *   - http://ktug.org/~nomos/harfbuzz-hangul/hangulshaper.pdf
 */
var HangulShaper = (_temp$1 = _class$5 = function (_DefaultShaper) {
  _inherits(HangulShaper, _DefaultShaper);

  function HangulShaper() {
    _classCallCheck(this, HangulShaper);

    return _possibleConstructorReturn(this, (HangulShaper.__proto__ || _Object$getPrototypeOf(HangulShaper)).apply(this, arguments));
  }

  _createClass(HangulShaper, null, [{
    key: 'planFeatures',
    value: function planFeatures(plan) {
      plan.add(['ljmo', 'vjmo', 'tjmo'], false);
    }
  }, {
    key: 'assignFeatures',
    value: function assignFeatures(plan, glyphs) {
      var state = 0;
      var i = 0;
      while (i < glyphs.length) {
        var action = void 0;
        var glyph = glyphs[i];
        var code = glyph.codePoints[0];
        var type = getType(code);

        var _STATE_TABLE$state$ty = _slicedToArray(STATE_TABLE$1[state][type], 2);

        action = _STATE_TABLE$state$ty[0];
        state = _STATE_TABLE$state$ty[1];


        switch (action) {
          case DECOMPOSE:
            // Decompose the composed syllable if it is not supported by the font.
            if (!plan.font.hasGlyphForCodePoint(code)) {
              i = decompose(glyphs, i, plan.font);
            }
            break;

          case COMPOSE:
            // Found a decomposed syllable. Try to compose if supported by the font.
            i = compose(glyphs, i, plan.font);
            break;

          case TONE_MARK:
            // Got a valid syllable, followed by a tone mark. Move the tone mark to the beginning of the syllable.
            reorderToneMark(glyphs, i, plan.font);
            break;

          case INVALID:
            // Tone mark has no valid syllable to attach to, so insert a dotted circle
            i = insertDottedCircle(glyphs, i, plan.font);
            break;
        }

        i++;
      }
    }
  }]);

  return HangulShaper;
}(DefaultShaper), _class$5.zeroMarkWidths = 'NONE', _temp$1);
var HANGUL_BASE = 0xac00;
var HANGUL_END = 0xd7a4;
var HANGUL_COUNT = HANGUL_END - HANGUL_BASE + 1;
var L_BASE = 0x1100; // lead
var V_BASE = 0x1161; // vowel
var T_BASE = 0x11a7; // trail
var L_COUNT = 19;
var V_COUNT = 21;
var T_COUNT = 28;
var L_END = L_BASE + L_COUNT - 1;
var V_END = V_BASE + V_COUNT - 1;
var T_END = T_BASE + T_COUNT - 1;
var DOTTED_CIRCLE = 0x25cc;

var isL = function isL(code) {
  return 0x1100 <= code && code <= 0x115f || 0xa960 <= code && code <= 0xa97c;
};
var isV = function isV(code) {
  return 0x1160 <= code && code <= 0x11a7 || 0xd7b0 <= code && code <= 0xd7c6;
};
var isT = function isT(code) {
  return 0x11a8 <= code && code <= 0x11ff || 0xd7cb <= code && code <= 0xd7fb;
};
var isTone = function isTone(code) {
  return 0x302e <= code && code <= 0x302f;
};
var isLVT = function isLVT(code) {
  return HANGUL_BASE <= code && code <= HANGUL_END;
};
var isLV = function isLV(code) {
  return code - HANGUL_BASE < HANGUL_COUNT && (code - HANGUL_BASE) % T_COUNT === 0;
};
var isCombiningL = function isCombiningL(code) {
  return L_BASE <= code && code <= L_END;
};
var isCombiningV = function isCombiningV(code) {
  return V_BASE <= code && code <= V_END;
};
var isCombiningT = function isCombiningT(code) {
  return T_BASE + 1 && 1 <= code && code <= T_END;
};

// Character categories
var X = 0; // Other character
var L = 1; // Leading consonant
var V = 2; // Medial vowel
var T = 3; // Trailing consonant
var LV = 4; // Composed <LV> syllable
var LVT = 5; // Composed <LVT> syllable
var M = 6; // Tone mark

// This function classifies a character using the above categories.
function getType(code) {
  if (isL(code)) {
    return L;
  }
  if (isV(code)) {
    return V;
  }
  if (isT(code)) {
    return T;
  }
  if (isLV(code)) {
    return LV;
  }
  if (isLVT(code)) {
    return LVT;
  }
  if (isTone(code)) {
    return M;
  }
  return X;
}

// State machine actions
var NO_ACTION = 0;
var DECOMPOSE = 1;
var COMPOSE = 2;
var TONE_MARK = 4;
var INVALID = 5;

// Build a state machine that accepts valid syllables, and applies actions along the way.
// The logic this is implementing is documented at the top of the file.
var STATE_TABLE$1 = [
//       X                 L                 V                T                  LV                LVT               M
// State 0: start state
[[NO_ACTION, 0], [NO_ACTION, 1], [NO_ACTION, 0], [NO_ACTION, 0], [DECOMPOSE, 2], [DECOMPOSE, 3], [INVALID, 0]],

// State 1: <L>
[[NO_ACTION, 0], [NO_ACTION, 1], [COMPOSE, 2], [NO_ACTION, 0], [DECOMPOSE, 2], [DECOMPOSE, 3], [INVALID, 0]],

// State 2: <L,V> or <LV>
[[NO_ACTION, 0], [NO_ACTION, 1], [NO_ACTION, 0], [COMPOSE, 3], [DECOMPOSE, 2], [DECOMPOSE, 3], [TONE_MARK, 0]],

// State 3: <L,V,T> or <LVT>
[[NO_ACTION, 0], [NO_ACTION, 1], [NO_ACTION, 0], [NO_ACTION, 0], [DECOMPOSE, 2], [DECOMPOSE, 3], [TONE_MARK, 0]]];

function getGlyph(font, code, features) {
  return new GlyphInfo(font, font.glyphForCodePoint(code).id, [code], features);
}

function decompose(glyphs, i, font) {
  var glyph = glyphs[i];
  var code = glyph.codePoints[0];

  var s = code - HANGUL_BASE;
  var t = T_BASE + s % T_COUNT;
  s = s / T_COUNT | 0;
  var l = L_BASE + s / V_COUNT | 0;
  var v = V_BASE + s % V_COUNT;

  // Don't decompose if all of the components are not available
  if (!font.hasGlyphForCodePoint(l) || !font.hasGlyphForCodePoint(v) || t !== T_BASE && !font.hasGlyphForCodePoint(t)) {
    return i;
  }

  // Replace the current glyph with decomposed L, V, and T glyphs,
  // and apply the proper OpenType features to each component.
  var ljmo = getGlyph(font, l, glyph.features);
  ljmo.features.ljmo = true;

  var vjmo = getGlyph(font, v, glyph.features);
  vjmo.features.vjmo = true;

  var insert = [ljmo, vjmo];

  if (t > T_BASE) {
    var tjmo = getGlyph(font, t, glyph.features);
    tjmo.features.tjmo = true;
    insert.push(tjmo);
  }

  glyphs.splice.apply(glyphs, [i, 1].concat(insert));
  return i + insert.length - 1;
}

function compose(glyphs, i, font) {
  var glyph = glyphs[i];
  var code = glyphs[i].codePoints[0];
  var type = getType(code);

  var prev = glyphs[i - 1].codePoints[0];
  var prevType = getType(prev);

  // Figure out what type of syllable we're dealing with
  var lv = void 0,
      ljmo = void 0,
      vjmo = void 0,
      tjmo = void 0;
  if (prevType === LV && type === T) {
    // <LV,T>
    lv = prev;
    tjmo = glyph;
  } else {
    if (type === V) {
      // <L,V>
      ljmo = glyphs[i - 1];
      vjmo = glyph;
    } else {
      // <L,V,T>
      ljmo = glyphs[i - 2];
      vjmo = glyphs[i - 1];
      tjmo = glyph;
    }

    var l = ljmo.codePoints[0];
    var v = vjmo.codePoints[0];

    // Make sure L and V are combining characters
    if (isCombiningL(l) && isCombiningV(v)) {
      lv = HANGUL_BASE + ((l - L_BASE) * V_COUNT + (v - V_BASE)) * T_COUNT;
    }
  }

  var t = tjmo && tjmo.codePoints[0] || T_BASE;
  if (lv != null && (t === T_BASE || isCombiningT(t))) {
    var s = lv + (t - T_BASE);

    // Replace with a composed glyph if supported by the font,
    // otherwise apply the proper OpenType features to each component.
    if (font.hasGlyphForCodePoint(s)) {
      var del = prevType === V ? 3 : 2;
      glyphs.splice(i - del + 1, del, getGlyph(font, s, glyph.features));
      return i - del + 1;
    }
  }

  // Didn't compose (either a non-combining component or unsupported by font).
  if (ljmo) {
    ljmo.features.ljmo = true;
  }
  if (vjmo) {
    vjmo.features.vjmo = true;
  }
  if (tjmo) {
    tjmo.features.tjmo = true;
  }

  if (prevType === LV) {
    // Sequence was originally <L,V>, which got combined earlier.
    // Either the T was non-combining, or the LVT glyph wasn't supported.
    // Decompose the glyph again and apply OT features.
    decompose(glyphs, i - 1, font);
    return i + 1;
  }

  return i;
}

function getLength(code) {
  switch (getType(code)) {
    case LV:
    case LVT:
      return 1;
    case V:
      return 2;
    case T:
      return 3;
  }
}

function reorderToneMark(glyphs, i, font) {
  var glyph = glyphs[i];
  var code = glyphs[i].codePoints[0];

  // Move tone mark to the beginning of the previous syllable, unless it is zero width
  if (font.glyphForCodePoint(code).advanceWidth === 0) {
    return;
  }

  var prev = glyphs[i - 1].codePoints[0];
  var len = getLength(prev);

  glyphs.splice(i, 1);
  return glyphs.splice(i - len, 0, glyph);
}

function insertDottedCircle(glyphs, i, font) {
  var glyph = glyphs[i];
  var code = glyphs[i].codePoints[0];

  if (font.hasGlyphForCodePoint(DOTTED_CIRCLE)) {
    var dottedCircle = getGlyph(font, DOTTED_CIRCLE, glyph.features);

    // If the tone mark is zero width, insert the dotted circle before, otherwise after
    var idx = font.glyphForCodePoint(code).advanceWidth === 0 ? i : i + 1;
    glyphs.splice(idx, 0, dottedCircle);
    i++;
  }

  return i;
}

var categories$1 = ["O", "IND", "S", "GB", "B", "FM", "CGJ", "VMAbv", "VMPst", "VAbv", "VPst", "CMBlw", "VPre", "VBlw", "H", "VMBlw", "CMAbv", "MBlw", "CS", "R", "SUB", "MPst", "MPre", "FAbv", "FPst", "FBlw", "SMAbv", "SMBlw", "VMPre", "ZWNJ", "ZWJ", "WJ", "VS", "N", "HN", "MAbv"];
var decompositions$1 = { "2507": [2503, 2494], "2508": [2503, 2519], "2888": [2887, 2902], "2891": [2887, 2878], "2892": [2887, 2903], "3018": [3014, 3006], "3019": [3015, 3006], "3020": [3014, 3031], "3144": [3142, 3158], "3264": [3263, 3285], "3271": [3270, 3285], "3272": [3270, 3286], "3274": [3270, 3266], "3275": [3270, 3266, 3285], "3402": [3398, 3390], "3403": [3399, 3390], "3404": [3398, 3415], "3546": [3545, 3530], "3548": [3545, 3535], "3549": [3545, 3535, 3530], "3550": [3545, 3551], "3635": [3661, 3634], "3763": [3789, 3762], "3955": [3953, 3954], "3957": [3953, 3956], "3958": [4018, 3968], "3959": [4018, 3953, 3968], "3960": [4019, 3968], "3961": [4019, 3953, 3968], "3969": [3953, 3968], "6971": [6970, 6965], "6973": [6972, 6965], "6976": [6974, 6965], "6977": [6975, 6965], "6979": [6978, 6965], "69934": [69937, 69927], "69935": [69938, 69927], "70475": [70471, 70462], "70476": [70471, 70487], "70843": [70841, 70842], "70844": [70841, 70832], "70846": [70841, 70845], "71098": [71096, 71087], "71099": [71097, 71087] };
var stateTable = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [2, 2, 3, 4, 4, 5, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0, 17, 0, 11, 18, 19, 20, 21, 0, 0, 22, 0, 0, 2, 0, 23, 0, 24], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 26, 27, 0, 0, 0, 0, 26, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 0, 0, 0, 34, 40, 41, 42, 43, 0, 0, 44, 0, 0, 0, 38, 0, 0, 45], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 6, 7, 0, 0, 0, 0, 0, 0, 14, 0, 0, 0, 0, 0, 0, 0, 19, 20, 21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 19, 20, 21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 6, 7, 8, 9, 0, 0, 12, 0, 14, 0, 0, 0, 0, 0, 0, 0, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 6, 7, 0, 9, 0, 0, 0, 0, 14, 0, 0, 0, 0, 0, 0, 0, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 16, 0, 0, 0, 11, 18, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 24], [0, 0, 0, 0, 0, 5, 0, 6, 7, 8, 9, 0, 11, 12, 0, 14, 0, 0, 0, 0, 0, 0, 0, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 6, 7, 0, 9, 0, 0, 12, 0, 14, 0, 0, 0, 0, 0, 0, 0, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 0, 7, 0, 0, 0, 0, 0, 0, 14, 0, 0, 0, 0, 0, 0, 0, 19, 20, 21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0, 0, 0, 11, 18, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 24], [0, 0, 0, 0, 0, 5, 0, 6, 7, 8, 9, 0, 11, 12, 0, 14, 0, 0, 0, 0, 0, 11, 0, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 4, 4, 5, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 0, 0, 0, 11, 18, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 24], [0, 0, 0, 0, 0, 5, 0, 6, 7, 8, 9, 0, 11, 12, 0, 14, 0, 16, 0, 0, 0, 11, 0, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 24], [0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 19, 20, 21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 6, 7, 0, 0, 0, 0, 0, 0, 14, 0, 0, 0, 0, 0, 0, 0, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 47, 0, 48, 0], [0, 0, 0, 0, 0, 5, 0, 6, 7, 8, 9, 0, 11, 12, 0, 14, 0, 16, 0, 0, 0, 11, 0, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 26, 27, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 0, 0, 0, 0, 0, 0, 37, 0, 0, 0, 0, 0, 0, 0, 41, 42, 43, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 0, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 41, 42, 43, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 31, 32, 0, 0, 35, 0, 37, 0, 0, 0, 0, 0, 0, 0, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 0, 32, 0, 0, 0, 0, 37, 0, 0, 0, 0, 0, 0, 0, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 31, 32, 33, 34, 35, 36, 37, 0, 39, 0, 0, 0, 34, 40, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 45], [0, 0, 0, 0, 0, 28, 0, 29, 30, 31, 32, 0, 34, 35, 0, 37, 0, 0, 0, 0, 0, 0, 0, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 0, 32, 0, 0, 35, 0, 37, 0, 0, 0, 0, 0, 0, 0, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 0, 30, 0, 0, 0, 0, 0, 0, 37, 0, 0, 0, 0, 0, 0, 0, 41, 42, 43, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 0, 0, 0, 34, 40, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 45], [0, 0, 0, 0, 0, 28, 0, 29, 30, 31, 32, 0, 34, 35, 0, 37, 0, 0, 0, 0, 0, 34, 0, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 31, 32, 0, 34, 35, 0, 37, 0, 39, 0, 0, 0, 34, 0, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 45], [0, 0, 0, 0, 0, 28, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 41, 42, 43, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 42, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 42, 43, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 0, 0, 0, 0, 0, 0, 37, 0, 0, 0, 0, 0, 0, 0, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 31, 32, 0, 34, 35, 0, 37, 0, 39, 0, 0, 0, 34, 0, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5, 0, 6, 7, 8, 9, 50, 11, 12, 13, 14, 50, 16, 0, 0, 0, 11, 18, 19, 20, 21, 0, 0, 22, 0, 0, 0, 51, 0, 0, 24], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 48, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 52, 0, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 31, 32, 53, 34, 35, 36, 37, 53, 39, 0, 0, 0, 34, 40, 41, 42, 43, 0, 0, 44, 0, 0, 0, 54, 0, 0, 45], [0, 0, 0, 0, 0, 5, 0, 6, 7, 8, 9, 50, 11, 12, 13, 14, 0, 16, 0, 0, 0, 11, 18, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 24], [0, 0, 0, 0, 0, 5, 0, 6, 7, 8, 9, 50, 11, 12, 13, 14, 50, 16, 0, 0, 0, 11, 18, 19, 20, 21, 0, 0, 22, 0, 0, 0, 0, 0, 0, 24], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 47, 0, 48, 0], [0, 0, 0, 0, 0, 28, 0, 29, 30, 31, 32, 53, 34, 35, 36, 37, 0, 39, 0, 0, 0, 34, 40, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 45], [0, 0, 0, 0, 0, 28, 0, 29, 30, 31, 32, 53, 34, 35, 36, 37, 53, 39, 0, 0, 0, 34, 40, 41, 42, 43, 0, 0, 44, 0, 0, 0, 0, 0, 0, 45]];
var accepting = [false, true, true, true, true, true, true, true, true, true, true, true, true, false, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true];
var tags = [[], ["broken_cluster"], ["independent_cluster"], ["symbol_cluster"], ["standard_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], [], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["broken_cluster"], ["numeral_cluster"], ["broken_cluster"], ["independent_cluster"], ["symbol_cluster"], ["symbol_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["virama_terminated_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["standard_cluster"], ["broken_cluster"], ["numeral_cluster"], ["number_joiner_terminated_cluster"], ["standard_cluster"], ["broken_cluster"], ["broken_cluster"], ["numeral_cluster"], ["standard_cluster"], ["standard_cluster"]];
var useData = {
	categories: categories$1,
	decompositions: decompositions$1,
	stateTable: stateTable,
	accepting: accepting,
	tags: tags
};

var _class$6;
var _temp$2;
var categories = useData.categories;
var decompositions = useData.decompositions;
var trie$1 = new UnicodeTrie(require('fs').readFileSync(__dirname + '/use.trie'));
var stateMachine = new StateMachine(useData);

/**
 * This shaper is an implementation of the Universal Shaping Engine, which
 * uses Unicode data to shape a number of scripts without a dedicated shaping engine.
 * See https://www.microsoft.com/typography/OpenTypeDev/USE/intro.htm.
 */
var UniversalShaper = (_temp$2 = _class$6 = function (_DefaultShaper) {
  _inherits(UniversalShaper, _DefaultShaper);

  function UniversalShaper() {
    _classCallCheck(this, UniversalShaper);

    return _possibleConstructorReturn(this, (UniversalShaper.__proto__ || _Object$getPrototypeOf(UniversalShaper)).apply(this, arguments));
  }

  _createClass(UniversalShaper, null, [{
    key: 'planFeatures',
    value: function planFeatures(plan) {
      plan.addStage(setupSyllables);

      // Default glyph pre-processing group
      plan.addStage(['locl', 'ccmp', 'nukt', 'akhn']);

      // Reordering group
      plan.addStage(clearSubstitutionFlags);
      plan.addStage(['rphf'], false);
      plan.addStage(recordRphf);
      plan.addStage(clearSubstitutionFlags);
      plan.addStage(['pref']);
      plan.addStage(recordPref);

      // Orthographic unit shaping group
      plan.addStage(['rkrf', 'abvf', 'blwf', 'half', 'pstf', 'vatu', 'cjct']);
      plan.addStage(reorder);

      // Topographical features
      // Scripts that need this are handled by the Arabic shaper, not implemented here for now.
      // plan.addStage(['isol', 'init', 'medi', 'fina', 'med2', 'fin2', 'fin3'], false);

      // Standard topographic presentation and positional feature application
      plan.addStage(['abvs', 'blws', 'pres', 'psts', 'dist', 'abvm', 'blwm']);
    }
  }, {
    key: 'assignFeatures',
    value: function assignFeatures(plan, glyphs) {
      var _loop = function _loop(i) {
        var codepoint = glyphs[i].codePoints[0];
        if (decompositions[codepoint]) {
          var decomposed = decompositions[codepoint].map(function (c) {
            var g = plan.font.glyphForCodePoint(c);
            return new GlyphInfo(plan.font, g.id, [c], glyphs[i].features);
          });

          glyphs.splice.apply(glyphs, [i, 1].concat(_toConsumableArray(decomposed)));
        }
      };

      // Decompose split vowels
      // TODO: do this in a more general unicode normalizer
      for (var i = glyphs.length - 1; i >= 0; i--) {
        _loop(i);
      }
    }
  }]);

  return UniversalShaper;
}(DefaultShaper), _class$6.zeroMarkWidths = 'BEFORE_GPOS', _temp$2);
function useCategory(glyph) {
  return trie$1.get(glyph.codePoints[0]);
}

var USEInfo = function USEInfo(category, syllableType, syllable) {
  _classCallCheck(this, USEInfo);

  this.category = category;
  this.syllableType = syllableType;
  this.syllable = syllable;
};

function setupSyllables(font, glyphs) {
  var syllable = 0;
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = _getIterator(stateMachine.match(glyphs.map(useCategory))), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var _step$value = _slicedToArray(_step.value, 3),
          start = _step$value[0],
          end = _step$value[1],
          tags = _step$value[2];

      ++syllable;

      // Create shaper info
      for (var i = start; i <= end; i++) {
        glyphs[i].shaperInfo = new USEInfo(categories[useCategory(glyphs[i])], tags[0], syllable);
      }

      // Assign rphf feature
      var limit = glyphs[start].shaperInfo.category === 'R' ? 1 : Math.min(3, end - start);
      for (var _i = start; _i < start + limit; _i++) {
        glyphs[_i].features.rphf = true;
      }
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }
}

function clearSubstitutionFlags(font, glyphs) {
  var _iteratorNormalCompletion2 = true;
  var _didIteratorError2 = false;
  var _iteratorError2 = undefined;

  try {
    for (var _iterator2 = _getIterator(glyphs), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
      var glyph = _step2.value;

      glyph.substituted = false;
    }
  } catch (err) {
    _didIteratorError2 = true;
    _iteratorError2 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion2 && _iterator2.return) {
        _iterator2.return();
      }
    } finally {
      if (_didIteratorError2) {
        throw _iteratorError2;
      }
    }
  }
}

function recordRphf(font, glyphs) {
  var _iteratorNormalCompletion3 = true;
  var _didIteratorError3 = false;
  var _iteratorError3 = undefined;

  try {
    for (var _iterator3 = _getIterator(glyphs), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
      var glyph = _step3.value;

      if (glyph.substituted && glyph.features.rphf) {
        // Mark a substituted repha.
        glyph.shaperInfo.category = 'R';
      }
    }
  } catch (err) {
    _didIteratorError3 = true;
    _iteratorError3 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion3 && _iterator3.return) {
        _iterator3.return();
      }
    } finally {
      if (_didIteratorError3) {
        throw _iteratorError3;
      }
    }
  }
}

function recordPref(font, glyphs) {
  var _iteratorNormalCompletion4 = true;
  var _didIteratorError4 = false;
  var _iteratorError4 = undefined;

  try {
    for (var _iterator4 = _getIterator(glyphs), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
      var glyph = _step4.value;

      if (glyph.substituted) {
        // Mark a substituted pref as VPre, as they behave the same way.
        glyph.shaperInfo.category = 'VPre';
      }
    }
  } catch (err) {
    _didIteratorError4 = true;
    _iteratorError4 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion4 && _iterator4.return) {
        _iterator4.return();
      }
    } finally {
      if (_didIteratorError4) {
        throw _iteratorError4;
      }
    }
  }
}

function reorder(font, glyphs) {
  var dottedCircle = font.glyphForCodePoint(0x25cc).id;

  for (var start = 0, end = nextSyllable(glyphs, 0); start < glyphs.length; start = end, end = nextSyllable(glyphs, start)) {
    var i = void 0,
        j = void 0;
    var info = glyphs[start].shaperInfo;
    var type = info.syllableType;

    // Only a few syllable types need reordering.
    if (type !== 'virama_terminated_cluster' && type !== 'standard_cluster' && type !== 'broken_cluster') {
      continue;
    }

    // Insert a dotted circle glyph in broken clusters.
    if (type === 'broken_cluster' && dottedCircle) {
      var g = new GlyphInfo(font, dottedCircle, [0x25cc]);
      g.shaperInfo = info;

      // Insert after possible Repha.
      for (i = start; i < end && glyphs[i].shaperInfo.category === 'R'; i++) {}
      glyphs.splice(++i, 0, g);
      end++;
    }

    // Move things forward.
    if (info.category === 'R' && end - start > 1) {
      // Got a repha. Reorder it to after first base, before first halant.
      for (i = start + 1; i < end; i++) {
        info = glyphs[i].shaperInfo;
        if (isBase(info) || isHalant(glyphs[i])) {
          // If we hit a halant, move before it; otherwise it's a base: move to it's
          // place, and shift things in between backward.
          if (isHalant(glyphs[i])) {
            i--;
          }

          glyphs.splice.apply(glyphs, [start, 0].concat(_toConsumableArray(glyphs.splice(start + 1, i - start)), [glyphs[i]]));
          break;
        }
      }
    }

    // Move things back.
    for (i = start, j = end; i < end; i++) {
      info = glyphs[i].shaperInfo;
      if (isBase(info) || isHalant(glyphs[i])) {
        // If we hit a halant, move after it; otherwise it's a base: move to it's
        // place, and shift things in between backward.
        j = isHalant(glyphs[i]) ? i + 1 : i;
      } else if ((info.category === 'VPre' || info.category === 'VMPre') && j < i) {
        glyphs.splice.apply(glyphs, [j, 1, glyphs[i]].concat(_toConsumableArray(glyphs.splice(j, i - j))));
      }
    }
  }
}

function nextSyllable(glyphs, start) {
  if (start >= glyphs.length) return start;
  var syllable = glyphs[start].shaperInfo.syllable;
  while (++start < glyphs.length && glyphs[start].shaperInfo.syllable === syllable) {}
  return start;
}

function isHalant(glyph) {
  return glyph.shaperInfo.category === 'H' && !glyph.isLigated;
}

function isBase(info) {
  return info.category === 'B' || info.category === 'GB';
}

var SHAPERS = {
  arab: ArabicShaper, // Arabic
  mong: ArabicShaper, // Mongolian
  syrc: ArabicShaper, // Syriac
  'nko ': ArabicShaper, // N'Ko
  phag: ArabicShaper, // Phags Pa
  mand: ArabicShaper, // Mandaic
  mani: ArabicShaper, // Manichaean
  phlp: ArabicShaper, // Psalter Pahlavi

  hang: HangulShaper, // Hangul

  bali: UniversalShaper, // Balinese
  batk: UniversalShaper, // Batak
  brah: UniversalShaper, // Brahmi
  bugi: UniversalShaper, // Buginese
  buhd: UniversalShaper, // Buhid
  cakm: UniversalShaper, // Chakma
  cham: UniversalShaper, // Cham
  dupl: UniversalShaper, // Duployan
  egyp: UniversalShaper, // Egyptian Hieroglyphs
  gran: UniversalShaper, // Grantha
  hano: UniversalShaper, // Hanunoo
  java: UniversalShaper, // Javanese
  kthi: UniversalShaper, // Kaithi
  kali: UniversalShaper, // Kayah Li
  khar: UniversalShaper, // Kharoshthi
  khoj: UniversalShaper, // Khojki
  sind: UniversalShaper, // Khudawadi
  lepc: UniversalShaper, // Lepcha
  limb: UniversalShaper, // Limbu
  mahj: UniversalShaper, // Mahajani
  // mand: UniversalShaper, // Mandaic
  // mani: UniversalShaper, // Manichaean
  mtei: UniversalShaper, // Meitei Mayek
  modi: UniversalShaper, // Modi
  // mong: UniversalShaper, // Mongolian
  // 'nko ': UniversalShaper, // N’Ko
  hmng: UniversalShaper, // Pahawh Hmong
  // phag: UniversalShaper, // Phags-pa
  // phlp: UniversalShaper, // Psalter Pahlavi
  rjng: UniversalShaper, // Rejang
  saur: UniversalShaper, // Saurashtra
  shrd: UniversalShaper, // Sharada
  sidd: UniversalShaper, // Siddham
  sinh: UniversalShaper, // Sinhala
  sund: UniversalShaper, // Sundanese
  sylo: UniversalShaper, // Syloti Nagri
  tglg: UniversalShaper, // Tagalog
  tagb: UniversalShaper, // Tagbanwa
  tale: UniversalShaper, // Tai Le
  lana: UniversalShaper, // Tai Tham
  tavt: UniversalShaper, // Tai Viet
  takr: UniversalShaper, // Takri
  tibt: UniversalShaper, // Tibetan
  tfng: UniversalShaper, // Tifinagh
  tirh: UniversalShaper, // Tirhuta

  latn: DefaultShaper, // Latin
  DFLT: DefaultShaper // Default
};

function choose(script) {
  var shaper = SHAPERS[script];
  if (shaper) {
    return shaper;
  }

  return DefaultShaper;
}

var GSUBProcessor = function (_OTProcessor) {
  _inherits(GSUBProcessor, _OTProcessor);

  function GSUBProcessor() {
    _classCallCheck(this, GSUBProcessor);

    return _possibleConstructorReturn(this, (GSUBProcessor.__proto__ || _Object$getPrototypeOf(GSUBProcessor)).apply(this, arguments));
  }

  _createClass(GSUBProcessor, [{
    key: 'applyLookup',
    value: function applyLookup(lookupType, table) {
      var _this2 = this;

      switch (lookupType) {
        case 1:
          {
            // Single Substitution
            var index = this.coverageIndex(table.coverage);
            if (index === -1) {
              return false;
            }

            var glyph = this.glyphIterator.cur;
            switch (table.version) {
              case 1:
                glyph.id = glyph.id + table.deltaGlyphID & 0xffff;
                break;

              case 2:
                glyph.id = table.substitute.get(index);
                break;
            }

            return true;
          }

        case 2:
          {
            // Multiple Substitution
            var _index = this.coverageIndex(table.coverage);
            if (_index !== -1) {
              var _ret = function () {
                var _glyphs;

                var sequence = table.sequences.get(_index);
                _this2.glyphIterator.cur.id = sequence[0];
                _this2.glyphIterator.cur.ligatureComponent = 0;

                var features = _this2.glyphIterator.cur.features;
                var curGlyph = _this2.glyphIterator.cur;
                var replacement = sequence.slice(1).map(function (gid, i) {
                  var glyph = new GlyphInfo(_this2.font, gid, undefined, features);
                  glyph.shaperInfo = curGlyph.shaperInfo;
                  glyph.isLigated = curGlyph.isLigated;
                  glyph.ligatureComponent = i + 1;
                  glyph.substituted = true;
                  return glyph;
                });

                (_glyphs = _this2.glyphs).splice.apply(_glyphs, [_this2.glyphIterator.index + 1, 0].concat(_toConsumableArray(replacement)));
                return {
                  v: true
                };
              }();

              if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
            }

            return false;
          }

        case 3:
          {
            // Alternate Substitution
            var _index2 = this.coverageIndex(table.coverage);
            if (_index2 !== -1) {
              var USER_INDEX = 0; // TODO
              this.glyphIterator.cur.id = table.alternateSet.get(_index2)[USER_INDEX];
              return true;
            }

            return false;
          }

        case 4:
          {
            // Ligature Substitution
            var _index3 = this.coverageIndex(table.coverage);
            if (_index3 === -1) {
              return false;
            }

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
              for (var _iterator = _getIterator(table.ligatureSets.get(_index3)), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var ligature = _step.value;

                var matched = this.sequenceMatchIndices(1, ligature.components);
                if (!matched) {
                  continue;
                }

                var curGlyph = this.glyphIterator.cur;

                // Concatenate all of the characters the new ligature will represent
                var characters = curGlyph.codePoints.slice();
                var _iteratorNormalCompletion2 = true;
                var _didIteratorError2 = false;
                var _iteratorError2 = undefined;

                try {
                  for (var _iterator2 = _getIterator(matched), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var _index4 = _step2.value;

                    characters.push.apply(characters, _toConsumableArray(this.glyphs[_index4].codePoints));
                  }

                  // Create the replacement ligature glyph
                } catch (err) {
                  _didIteratorError2 = true;
                  _iteratorError2 = err;
                } finally {
                  try {
                    if (!_iteratorNormalCompletion2 && _iterator2.return) {
                      _iterator2.return();
                    }
                  } finally {
                    if (_didIteratorError2) {
                      throw _iteratorError2;
                    }
                  }
                }

                var ligatureGlyph = new GlyphInfo(this.font, ligature.glyph, characters, curGlyph.features);
                ligatureGlyph.shaperInfo = curGlyph.shaperInfo;
                ligatureGlyph.isLigated = true;
                ligatureGlyph.substituted = true;

                // From Harfbuzz:
                // - If it *is* a mark ligature, we don't allocate a new ligature id, and leave
                //   the ligature to keep its old ligature id.  This will allow it to attach to
                //   a base ligature in GPOS.  Eg. if the sequence is: LAM,LAM,SHADDA,FATHA,HEH,
                //   and LAM,LAM,HEH for a ligature, they will leave SHADDA and FATHA with a
                //   ligature id and component value of 2.  Then if SHADDA,FATHA form a ligature
                //   later, we don't want them to lose their ligature id/component, otherwise
                //   GPOS will fail to correctly position the mark ligature on top of the
                //   LAM,LAM,HEH ligature. See https://bugzilla.gnome.org/show_bug.cgi?id=676343
                //
                // - If a ligature is formed of components that some of which are also ligatures
                //   themselves, and those ligature components had marks attached to *their*
                //   components, we have to attach the marks to the new ligature component
                //   positions!  Now *that*'s tricky!  And these marks may be following the
                //   last component of the whole sequence, so we should loop forward looking
                //   for them and update them.
                //
                //   Eg. the sequence is LAM,LAM,SHADDA,FATHA,HEH, and the font first forms a
                //   'calt' ligature of LAM,HEH, leaving the SHADDA and FATHA with a ligature
                //   id and component == 1.  Now, during 'liga', the LAM and the LAM-HEH ligature
                //   form a LAM-LAM-HEH ligature.  We need to reassign the SHADDA and FATHA to
                //   the new ligature with a component value of 2.
                //
                //   This in fact happened to a font...  See https://bugzilla.gnome.org/show_bug.cgi?id=437633
                var isMarkLigature = curGlyph.isMark;
                for (var i = 0; i < matched.length && isMarkLigature; i++) {
                  isMarkLigature = this.glyphs[matched[i]].isMark;
                }

                ligatureGlyph.ligatureID = isMarkLigature ? null : this.ligatureID++;

                var lastLigID = curGlyph.ligatureID;
                var lastNumComps = curGlyph.codePoints.length;
                var curComps = lastNumComps;
                var idx = this.glyphIterator.index + 1;

                // Set ligatureID and ligatureComponent on glyphs that were skipped in the matched sequence.
                // This allows GPOS to attach marks to the correct ligature components.
                var _iteratorNormalCompletion3 = true;
                var _didIteratorError3 = false;
                var _iteratorError3 = undefined;

                try {
                  for (var _iterator3 = _getIterator(matched), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                    var matchIndex = _step3.value;

                    // Don't assign new ligature components for mark ligatures (see above)
                    if (isMarkLigature) {
                      idx = matchIndex;
                    } else {
                      while (idx < matchIndex) {
                        var ligatureComponent = curComps - lastNumComps + Math.min(this.glyphs[idx].ligatureComponent || 1, lastNumComps);
                        this.glyphs[idx].ligatureID = ligatureGlyph.ligatureID;
                        this.glyphs[idx].ligatureComponent = ligatureComponent;
                        idx++;
                      }
                    }

                    lastLigID = this.glyphs[idx].ligatureID;
                    lastNumComps = this.glyphs[idx].codePoints.length;
                    curComps += lastNumComps;
                    idx++; // skip base glyph
                  }

                  // Adjust ligature components for any marks following
                } catch (err) {
                  _didIteratorError3 = true;
                  _iteratorError3 = err;
                } finally {
                  try {
                    if (!_iteratorNormalCompletion3 && _iterator3.return) {
                      _iterator3.return();
                    }
                  } finally {
                    if (_didIteratorError3) {
                      throw _iteratorError3;
                    }
                  }
                }

                if (lastLigID && !isMarkLigature) {
                  for (var _i = idx; _i < this.glyphs.length; _i++) {
                    if (this.glyphs[_i].ligatureID === lastLigID) {
                      var ligatureComponent = curComps - lastNumComps + Math.min(this.glyphs[_i].ligatureComponent || 1, lastNumComps);
                      this.glyphs[_i].ligatureComponent = ligatureComponent;
                    } else {
                      break;
                    }
                  }
                }

                // Delete the matched glyphs, and replace the current glyph with the ligature glyph
                for (var _i2 = matched.length - 1; _i2 >= 0; _i2--) {
                  this.glyphs.splice(matched[_i2], 1);
                }

                this.glyphs[this.glyphIterator.index] = ligatureGlyph;
                return true;
              }
            } catch (err) {
              _didIteratorError = true;
              _iteratorError = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion && _iterator.return) {
                  _iterator.return();
                }
              } finally {
                if (_didIteratorError) {
                  throw _iteratorError;
                }
              }
            }

            return false;
          }

        case 5:
          // Contextual Substitution
          return this.applyContext(table);

        case 6:
          // Chaining Contextual Substitution
          return this.applyChainingContext(table);

        case 7:
          // Extension Substitution
          return this.applyLookup(table.lookupType, table.extension);

        default:
          throw new Error('GSUB lookupType ' + lookupType + ' is not supported');
      }
    }
  }]);

  return GSUBProcessor;
}(OTProcessor);

var GPOSProcessor = function (_OTProcessor) {
  _inherits(GPOSProcessor, _OTProcessor);

  function GPOSProcessor() {
    _classCallCheck(this, GPOSProcessor);

    return _possibleConstructorReturn(this, (GPOSProcessor.__proto__ || _Object$getPrototypeOf(GPOSProcessor)).apply(this, arguments));
  }

  _createClass(GPOSProcessor, [{
    key: 'applyPositionValue',
    value: function applyPositionValue(sequenceIndex, value) {
      var position = this.positions[this.glyphIterator.peekIndex(sequenceIndex)];
      if (value.xAdvance != null) {
        position.xAdvance += value.xAdvance;
      }

      if (value.yAdvance != null) {
        position.yAdvance += value.yAdvance;
      }

      if (value.xPlacement != null) {
        position.xOffset += value.xPlacement;
      }

      if (value.yPlacement != null) {
        position.yOffset += value.yPlacement;
      }

      // TODO: device tables
    }
  }, {
    key: 'applyLookup',
    value: function applyLookup(lookupType, table) {
      switch (lookupType) {
        case 1:
          {
            // Single positioning value
            var index = this.coverageIndex(table.coverage);
            if (index === -1) {
              return false;
            }

            switch (table.version) {
              case 1:
                this.applyPositionValue(0, table.value);
                break;

              case 2:
                this.applyPositionValue(0, table.values.get(index));
                break;
            }

            return true;
          }

        case 2:
          {
            // Pair Adjustment Positioning
            var nextGlyph = this.glyphIterator.peek();
            if (!nextGlyph) {
              return false;
            }

            var _index = this.coverageIndex(table.coverage);
            if (_index === -1) {
              return false;
            }

            switch (table.version) {
              case 1:
                // Adjustments for glyph pairs
                var set = table.pairSets.get(_index);

                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                  for (var _iterator = _getIterator(set), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var _pair = _step.value;

                    if (_pair.secondGlyph === nextGlyph.id) {
                      this.applyPositionValue(0, _pair.value1);
                      this.applyPositionValue(1, _pair.value2);
                      return true;
                    }
                  }
                } catch (err) {
                  _didIteratorError = true;
                  _iteratorError = err;
                } finally {
                  try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                      _iterator.return();
                    }
                  } finally {
                    if (_didIteratorError) {
                      throw _iteratorError;
                    }
                  }
                }

                return false;

              case 2:
                // Class pair adjustment
                var class1 = this.getClassID(this.glyphIterator.cur.id, table.classDef1);
                var class2 = this.getClassID(nextGlyph.id, table.classDef2);
                if (class1 === -1 || class2 === -1) {
                  return false;
                }

                var pair = table.classRecords.get(class1).get(class2);
                this.applyPositionValue(0, pair.value1);
                this.applyPositionValue(1, pair.value2);
                return true;
            }
          }

        case 3:
          {
            // Cursive Attachment Positioning
            var nextIndex = this.glyphIterator.peekIndex();
            var _nextGlyph = this.glyphs[nextIndex];
            if (!_nextGlyph) {
              return false;
            }

            var curRecord = table.entryExitRecords[this.coverageIndex(table.coverage)];
            if (!curRecord || !curRecord.exitAnchor) {
              return false;
            }

            var nextRecord = table.entryExitRecords[this.coverageIndex(table.coverage, _nextGlyph.id)];
            if (!nextRecord || !nextRecord.entryAnchor) {
              return false;
            }

            var entry = this.getAnchor(nextRecord.entryAnchor);
            var exit = this.getAnchor(curRecord.exitAnchor);

            var cur = this.positions[this.glyphIterator.index];
            var next = this.positions[nextIndex];

            switch (this.direction) {
              case 'ltr':
                cur.xAdvance = exit.x + cur.xOffset;

                var d = entry.x + next.xOffset;
                next.xAdvance -= d;
                next.xOffset -= d;
                break;

              case 'rtl':
                d = exit.x + cur.xOffset;
                cur.xAdvance -= d;
                cur.xOffset -= d;
                next.xAdvance = entry.x + next.xOffset;
                break;
            }

            if (this.glyphIterator.flags.rightToLeft) {
              this.glyphIterator.cur.cursiveAttachment = nextIndex;
              cur.yOffset = entry.y - exit.y;
            } else {
              _nextGlyph.cursiveAttachment = this.glyphIterator.index;
              cur.yOffset = exit.y - entry.y;
            }

            return true;
          }

        case 4:
          {
            // Mark to base positioning
            var markIndex = this.coverageIndex(table.markCoverage);
            if (markIndex === -1) {
              return false;
            }

            // search backward for a base glyph
            var baseGlyphIndex = this.glyphIterator.index;
            while (--baseGlyphIndex >= 0 && this.glyphs[baseGlyphIndex].isMark) {}

            if (baseGlyphIndex < 0) {
              return false;
            }

            var baseIndex = this.coverageIndex(table.baseCoverage, this.glyphs[baseGlyphIndex].id);
            if (baseIndex === -1) {
              return false;
            }

            var markRecord = table.markArray[markIndex];
            var baseAnchor = table.baseArray[baseIndex][markRecord.class];
            this.applyAnchor(markRecord, baseAnchor, baseGlyphIndex);
            return true;
          }

        case 5:
          {
            // Mark to ligature positioning
            var _markIndex = this.coverageIndex(table.markCoverage);
            if (_markIndex === -1) {
              return false;
            }

            // search backward for a base glyph
            var _baseGlyphIndex = this.glyphIterator.index;
            while (--_baseGlyphIndex >= 0 && this.glyphs[_baseGlyphIndex].isMark) {}

            if (_baseGlyphIndex < 0) {
              return false;
            }

            var ligIndex = this.coverageIndex(table.ligatureCoverage, this.glyphs[_baseGlyphIndex].id);
            if (ligIndex === -1) {
              return false;
            }

            var ligAttach = table.ligatureArray[ligIndex];
            var markGlyph = this.glyphIterator.cur;
            var ligGlyph = this.glyphs[_baseGlyphIndex];
            var compIndex = ligGlyph.ligatureID && ligGlyph.ligatureID === markGlyph.ligatureID && markGlyph.ligatureComponent != null ? Math.min(markGlyph.ligatureComponent, ligGlyph.codePoints.length) - 1 : ligGlyph.codePoints.length - 1;

            var _markRecord = table.markArray[_markIndex];
            var _baseAnchor = ligAttach[compIndex][_markRecord.class];
            this.applyAnchor(_markRecord, _baseAnchor, _baseGlyphIndex);
            return true;
          }

        case 6:
          {
            // Mark to mark positioning
            var mark1Index = this.coverageIndex(table.mark1Coverage);
            if (mark1Index === -1) {
              return false;
            }

            // get the previous mark to attach to
            var prevIndex = this.glyphIterator.peekIndex(-1);
            var prev = this.glyphs[prevIndex];
            if (!prev || !prev.isMark) {
              return false;
            }

            var _cur = this.glyphIterator.cur;

            // The following logic was borrowed from Harfbuzz
            var good = false;
            if (_cur.ligatureID === prev.ligatureID) {
              if (!_cur.ligatureID) {
                // Marks belonging to the same base
                good = true;
              } else if (_cur.ligatureComponent === prev.ligatureComponent) {
                // Marks belonging to the same ligature component
                good = true;
              }
            } else {
              // If ligature ids don't match, it may be the case that one of the marks
              // itself is a ligature, in which case match.
              if (_cur.ligatureID && !_cur.ligatureComponent || prev.ligatureID && !prev.ligatureComponent) {
                good = true;
              }
            }

            if (!good) {
              return false;
            }

            var mark2Index = this.coverageIndex(table.mark2Coverage, prev.id);
            if (mark2Index === -1) {
              return false;
            }

            var _markRecord2 = table.mark1Array[mark1Index];
            var _baseAnchor2 = table.mark2Array[mark2Index][_markRecord2.class];
            this.applyAnchor(_markRecord2, _baseAnchor2, prevIndex);
            return true;
          }

        case 7:
          // Contextual positioning
          return this.applyContext(table);

        case 8:
          // Chaining contextual positioning
          return this.applyChainingContext(table);

        case 9:
          // Extension positioning
          return this.applyLookup(table.lookupType, table.extension);

        default:
          throw new Error('Unsupported GPOS table: ' + lookupType);
      }
    }
  }, {
    key: 'applyAnchor',
    value: function applyAnchor(markRecord, baseAnchor, baseGlyphIndex) {
      var baseCoords = this.getAnchor(baseAnchor);
      var markCoords = this.getAnchor(markRecord.markAnchor);

      var basePos = this.positions[baseGlyphIndex];
      var markPos = this.positions[this.glyphIterator.index];

      markPos.xOffset = baseCoords.x - markCoords.x;
      markPos.yOffset = baseCoords.y - markCoords.y;
      this.glyphIterator.cur.markAttachment = baseGlyphIndex;
    }
  }, {
    key: 'getAnchor',
    value: function getAnchor(anchor) {
      // TODO: contour point, device tables
      return {
        x: anchor.xCoordinate,
        y: anchor.yCoordinate
      };
    }
  }, {
    key: 'applyFeatures',
    value: function applyFeatures(userFeatures, glyphs, advances) {
      _get(GPOSProcessor.prototype.__proto__ || _Object$getPrototypeOf(GPOSProcessor.prototype), 'applyFeatures', this).call(this, userFeatures, glyphs, advances);

      for (var i = 0; i < this.glyphs.length; i++) {
        this.fixCursiveAttachment(i);
      }

      this.fixMarkAttachment();
    }
  }, {
    key: 'fixCursiveAttachment',
    value: function fixCursiveAttachment(i) {
      var glyph = this.glyphs[i];
      if (glyph.cursiveAttachment != null) {
        var j = glyph.cursiveAttachment;

        glyph.cursiveAttachment = null;
        this.fixCursiveAttachment(j);

        this.positions[i].yOffset += this.positions[j].yOffset;
      }
    }
  }, {
    key: 'fixMarkAttachment',
    value: function fixMarkAttachment() {
      for (var i = 0; i < this.glyphs.length; i++) {
        var glyph = this.glyphs[i];
        if (glyph.markAttachment != null) {
          var j = glyph.markAttachment;

          this.positions[i].xOffset += this.positions[j].xOffset;
          this.positions[i].yOffset += this.positions[j].yOffset;

          if (this.direction === 'ltr') {
            for (var k = j; k < i; k++) {
              this.positions[i].xOffset -= this.positions[k].xAdvance;
              this.positions[i].yOffset -= this.positions[k].yAdvance;
            }
          }
        }
      }
    }
  }]);

  return GPOSProcessor;
}(OTProcessor);

var OTLayoutEngine = function () {
  function OTLayoutEngine(font) {
    _classCallCheck(this, OTLayoutEngine);

    this.font = font;
    this.glyphInfos = null;
    this.plan = null;
    this.GSUBProcessor = null;
    this.GPOSProcessor = null;

    if (font.GSUB) {
      this.GSUBProcessor = new GSUBProcessor(font, font.GSUB);
    }

    if (font.GPOS) {
      this.GPOSProcessor = new GPOSProcessor(font, font.GPOS);
    }
  }

  _createClass(OTLayoutEngine, [{
    key: 'setup',
    value: function setup(glyphs, features, script, language) {
      var _this = this;

      // Map glyphs to GlyphInfo objects so data can be passed between
      // GSUB and GPOS without mutating the real (shared) Glyph objects.
      this.glyphInfos = glyphs.map(function (glyph) {
        return new GlyphInfo(_this.font, glyph.id, [].concat(_toConsumableArray(glyph.codePoints)));
      });

      // Choose a shaper based on the script, and setup a shaping plan.
      // This determines which features to apply to which glyphs.
      this.shaper = choose(script);
      this.plan = new ShapingPlan(this.font, script, language);
      return this.shaper.plan(this.plan, this.glyphInfos, features);
    }
  }, {
    key: 'substitute',
    value: function substitute(glyphs) {
      var _this2 = this;

      if (this.GSUBProcessor) {
        this.plan.process(this.GSUBProcessor, this.glyphInfos);

        // Map glyph infos back to normal Glyph objects
        glyphs = this.glyphInfos.map(function (glyphInfo) {
          return _this2.font.getGlyph(glyphInfo.id, glyphInfo.codePoints);
        });
      }

      return glyphs;
    }
  }, {
    key: 'position',
    value: function position(glyphs, positions) {
      if (this.shaper.zeroMarkWidths === 'BEFORE_GPOS') {
        this.zeroMarkAdvances(positions);
      }

      if (this.GPOSProcessor) {
        this.plan.process(this.GPOSProcessor, this.glyphInfos, positions);
      }

      if (this.shaper.zeroMarkWidths === 'AFTER_GPOS') {
        this.zeroMarkAdvances(positions);
      }

      // Reverse the glyphs and positions if the script is right-to-left
      if (this.plan.direction === 'rtl') {
        glyphs.reverse();
        positions.reverse();
      }

      return this.GPOSProcessor && this.GPOSProcessor.features;
    }
  }, {
    key: 'zeroMarkAdvances',
    value: function zeroMarkAdvances(positions) {
      for (var i = 0; i < this.glyphInfos.length; i++) {
        if (this.glyphInfos[i].isMark) {
          positions[i].xAdvance = 0;
          positions[i].yAdvance = 0;
        }
      }
    }
  }, {
    key: 'cleanup',
    value: function cleanup() {
      this.glyphInfos = null;
      this.plan = null;
      this.shaper = null;
    }
  }, {
    key: 'getAvailableFeatures',
    value: function getAvailableFeatures(script, language) {
      var features = [];

      if (this.GSUBProcessor) {
        this.GSUBProcessor.selectScript(script, language);
        features.push.apply(features, _toConsumableArray(_Object$keys(this.GSUBProcessor.features)));
      }

      if (this.GPOSProcessor) {
        this.GPOSProcessor.selectScript(script, language);
        features.push.apply(features, _toConsumableArray(_Object$keys(this.GPOSProcessor.features)));
      }

      return features;
    }
  }]);

  return OTLayoutEngine;
}();

var LayoutEngine = function () {
  function LayoutEngine(font) {
    _classCallCheck(this, LayoutEngine);

    this.font = font;
    this.unicodeLayoutEngine = null;
    this.kernProcessor = null;

    // Choose an advanced layout engine. We try the AAT morx table first since more
    // scripts are currently supported because the shaping logic is built into the font.
    if (this.font.morx) {
      this.engine = new AATLayoutEngine(this.font);
    } else if (this.font.GSUB || this.font.GPOS) {
      this.engine = new OTLayoutEngine(this.font);
    }
  }

  _createClass(LayoutEngine, [{
    key: 'layout',
    value: function layout(string) {
      var features = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
      var script = arguments[2];
      var language = arguments[3];

      // Make the features parameter optional
      if (typeof features === 'string') {
        script = features;
        language = script;
        features = [];
      }

      // Map string to glyphs if needed
      if (typeof string === 'string') {
        // Attempt to detect the script from the string if not provided.
        if (script == null) {
          script = forString(string);
        }

        var glyphs = this.font.glyphsForString(string);
      } else {
        // Attempt to detect the script from the glyph code points if not provided.
        if (script == null) {
          var codePoints = [];
          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = _getIterator(string), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              var glyph = _step.value;

              codePoints.push.apply(codePoints, _toConsumableArray(glyph.codePoints));
            }
          } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
              }
            } finally {
              if (_didIteratorError) {
                throw _iteratorError;
              }
            }
          }

          script = forCodePoints(codePoints);
        }

        var glyphs = string;
      }

      // Return early if there are no glyphs
      if (glyphs.length === 0) {
        return new GlyphRun(glyphs, []);
      }

      // Setup the advanced layout engine
      if (this.engine && this.engine.setup) {
        this.engine.setup(glyphs, features, script, language);
      }

      // Substitute and position the glyphs
      glyphs = this.substitute(glyphs, features, script, language);
      var positions = this.position(glyphs, features, script, language);

      // Let the layout engine clean up any state it might have
      if (this.engine && this.engine.cleanup) {
        this.engine.cleanup();
      }

      return new GlyphRun(glyphs, positions);
    }
  }, {
    key: 'substitute',
    value: function substitute(glyphs, features, script, language) {
      // Call the advanced layout engine to make substitutions
      if (this.engine && this.engine.substitute) {
        glyphs = this.engine.substitute(glyphs, features, script, language);
      }

      return glyphs;
    }
  }, {
    key: 'position',
    value: function position(glyphs, features, script, language) {
      // Get initial glyph positions
      var positions = glyphs.map(function (glyph) {
        return new GlyphPosition(glyph.advanceWidth);
      });
      var positioned = null;

      // Call the advanced layout engine. Returns the features applied.
      if (this.engine && this.engine.position) {
        positioned = this.engine.position(glyphs, positions, features, script, language);
      }

      // if there is no GPOS table, use unicode properties to position marks.
      if (!positioned) {
        if (!this.unicodeLayoutEngine) {
          this.unicodeLayoutEngine = new UnicodeLayoutEngine(this.font);
        }

        this.unicodeLayoutEngine.positionGlyphs(glyphs, positions);
      }

      // if kerning is not supported by GPOS, do kerning with the TrueType/AAT kern table
      if ((!positioned || !positioned.kern) && this.font.kern) {
        if (!this.kernProcessor) {
          this.kernProcessor = new KernProcessor(this.font);
        }

        this.kernProcessor.process(glyphs, positions);
      }

      return positions;
    }
  }, {
    key: 'getAvailableFeatures',
    value: function getAvailableFeatures(script, language) {
      var features = [];

      if (this.engine) {
        features.push.apply(features, _toConsumableArray(this.engine.getAvailableFeatures(script, language)));
      }

      if (this.font.kern && features.indexOf('kern') === -1) {
        features.push('kern');
      }

      return features;
    }
  }, {
    key: 'stringsForGlyph',
    value: function stringsForGlyph(gid) {
      var result = new _Set();

      var codePoints = this.font._cmapProcessor.codePointsForGlyph(gid);
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(codePoints), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var codePoint = _step2.value;

          result.add(_String$fromCodePoint(codePoint));
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      if (this.engine && this.engine.stringsForGlyph) {
        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = _getIterator(this.engine.stringsForGlyph(gid)), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            var string = _step3.value;

            result.add(string);
          }
        } catch (err) {
          _didIteratorError3 = true;
          _iteratorError3 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion3 && _iterator3.return) {
              _iterator3.return();
            }
          } finally {
            if (_didIteratorError3) {
              throw _iteratorError3;
            }
          }
        }
      }

      return _Array$from(result);
    }
  }]);

  return LayoutEngine;
}();

var SVG_COMMANDS = {
  moveTo: 'M',
  lineTo: 'L',
  quadraticCurveTo: 'Q',
  bezierCurveTo: 'C',
  closePath: 'Z'
};

/**
 * Path objects are returned by glyphs and represent the actual
 * vector outlines for each glyph in the font. Paths can be converted
 * to SVG path data strings, or to functions that can be applied to
 * render the path to a graphics context.
 */

var Path = function () {
  function Path() {
    _classCallCheck(this, Path);

    this.commands = [];
    this._bbox = null;
    this._cbox = null;
  }

  /**
   * Compiles the path to a JavaScript function that can be applied with
   * a graphics context in order to render the path.
   * @return {string}
   */


  _createClass(Path, [{
    key: 'toFunction',
    value: function toFunction() {
      var cmds = this.commands.map(function (c) {
        return '  ctx.' + c.command + '(' + c.args.join(', ') + ');';
      });
      return new Function('ctx', cmds.join('\n'));
    }

    /**
     * Converts the path to an SVG path data string
     * @return {string}
     */

  }, {
    key: 'toSVG',
    value: function toSVG() {
      var cmds = this.commands.map(function (c) {
        var args = c.args.map(function (arg) {
          return Math.round(arg * 100) / 100;
        });
        return '' + SVG_COMMANDS[c.command] + args.join(' ');
      });

      return cmds.join('');
    }

    /**
     * Gets the "control box" of a path.
     * This is like the bounding box, but it includes all points including
     * control points of bezier segments and is much faster to compute than
     * the real bounding box.
     * @type {BBox}
     */

  }, {
    key: 'cbox',
    get: function get() {
      if (!this._cbox) {
        var cbox = new BBox();
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = _getIterator(this.commands), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var command = _step.value;

            for (var _i = 0; _i < command.args.length; _i += 2) {
              cbox.addPoint(command.args[_i], command.args[_i + 1]);
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }

        this._cbox = _Object$freeze(cbox);
      }

      return this._cbox;
    }

    /**
     * Gets the exact bounding box of the path by evaluating curve segments.
     * Slower to compute than the control box, but more accurate.
     * @type {BBox}
     */

  }, {
    key: 'bbox',
    get: function get() {
      if (this._bbox) {
        return this._bbox;
      }

      var bbox = new BBox();
      var cx = 0,
          cy = 0;

      var f = function f(t) {
        return Math.pow(1 - t, 3) * p0[i] + 3 * Math.pow(1 - t, 2) * t * p1[i] + 3 * (1 - t) * Math.pow(t, 2) * p2[i] + Math.pow(t, 3) * p3[i];
      };

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(this.commands), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var c = _step2.value;

          switch (c.command) {
            case 'moveTo':
            case 'lineTo':
              var _c$args = _slicedToArray(c.args, 2),
                  x = _c$args[0],
                  y = _c$args[1];

              bbox.addPoint(x, y);
              cx = x;
              cy = y;
              break;

            case 'quadraticCurveTo':
            case 'bezierCurveTo':
              if (c.command === 'quadraticCurveTo') {
                // http://fontforge.org/bezier.html
                var _c$args2 = _slicedToArray(c.args, 4),
                    qp1x = _c$args2[0],
                    qp1y = _c$args2[1],
                    p3x = _c$args2[2],
                    p3y = _c$args2[3];

                var cp1x = cx + 2 / 3 * (qp1x - cx); // CP1 = QP0 + 2/3 * (QP1-QP0)
                var cp1y = cy + 2 / 3 * (qp1y - cy);
                var cp2x = p3x + 2 / 3 * (qp1x - p3x); // CP2 = QP2 + 2/3 * (QP1-QP2)
                var cp2y = p3y + 2 / 3 * (qp1y - p3y);
              } else {
                var _c$args3 = _slicedToArray(c.args, 6),
                    cp1x = _c$args3[0],
                    cp1y = _c$args3[1],
                    cp2x = _c$args3[2],
                    cp2y = _c$args3[3],
                    p3x = _c$args3[4],
                    p3y = _c$args3[5];
              }

              // http://blog.hackers-cafe.net/2009/06/how-to-calculate-bezier-curves-bounding.html
              bbox.addPoint(p3x, p3y);

              var p0 = [cx, cy];
              var p1 = [cp1x, cp1y];
              var p2 = [cp2x, cp2y];
              var p3 = [p3x, p3y];

              for (var i = 0; i <= 1; i++) {
                var b = 6 * p0[i] - 12 * p1[i] + 6 * p2[i];
                var a = -3 * p0[i] + 9 * p1[i] - 9 * p2[i] + 3 * p3[i];
                c = 3 * p1[i] - 3 * p0[i];

                if (a === 0) {
                  if (b === 0) {
                    continue;
                  }

                  var t = -c / b;
                  if (0 < t && t < 1) {
                    if (i === 0) {
                      bbox.addPoint(f(t), bbox.maxY);
                    } else if (i === 1) {
                      bbox.addPoint(bbox.maxX, f(t));
                    }
                  }

                  continue;
                }

                var b2ac = Math.pow(b, 2) - 4 * c * a;
                if (b2ac < 0) {
                  continue;
                }

                var t1 = (-b + Math.sqrt(b2ac)) / (2 * a);
                if (0 < t1 && t1 < 1) {
                  if (i === 0) {
                    bbox.addPoint(f(t1), bbox.maxY);
                  } else if (i === 1) {
                    bbox.addPoint(bbox.maxX, f(t1));
                  }
                }

                var t2 = (-b - Math.sqrt(b2ac)) / (2 * a);
                if (0 < t2 && t2 < 1) {
                  if (i === 0) {
                    bbox.addPoint(f(t2), bbox.maxY);
                  } else if (i === 1) {
                    bbox.addPoint(bbox.maxX, f(t2));
                  }
                }
              }

              cx = p3x;
              cy = p3y;
              break;
          }
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      return this._bbox = _Object$freeze(bbox);
    }
  }]);

  return Path;
}();

var _arr = ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'closePath'];

var _loop = function _loop() {
  var command = _arr[_i2];
  Path.prototype[command] = function () {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    this._bbox = this._cbox = null;
    this.commands.push({
      command: command,
      args: args
    });

    return this;
  };
};

for (var _i2 = 0; _i2 < _arr.length; _i2++) {
  _loop();
}

var StandardNames = ['.notdef', '.null', 'nonmarkingreturn', 'space', 'exclam', 'quotedbl', 'numbersign', 'dollar', 'percent', 'ampersand', 'quotesingle', 'parenleft', 'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash', 'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'colon', 'semicolon', 'less', 'equal', 'greater', 'question', 'at', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'bracketleft', 'backslash', 'bracketright', 'asciicircum', 'underscore', 'grave', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'braceleft', 'bar', 'braceright', 'asciitilde', 'Adieresis', 'Aring', 'Ccedilla', 'Eacute', 'Ntilde', 'Odieresis', 'Udieresis', 'aacute', 'agrave', 'acircumflex', 'adieresis', 'atilde', 'aring', 'ccedilla', 'eacute', 'egrave', 'ecircumflex', 'edieresis', 'iacute', 'igrave', 'icircumflex', 'idieresis', 'ntilde', 'oacute', 'ograve', 'ocircumflex', 'odieresis', 'otilde', 'uacute', 'ugrave', 'ucircumflex', 'udieresis', 'dagger', 'degree', 'cent', 'sterling', 'section', 'bullet', 'paragraph', 'germandbls', 'registered', 'copyright', 'trademark', 'acute', 'dieresis', 'notequal', 'AE', 'Oslash', 'infinity', 'plusminus', 'lessequal', 'greaterequal', 'yen', 'mu', 'partialdiff', 'summation', 'product', 'pi', 'integral', 'ordfeminine', 'ordmasculine', 'Omega', 'ae', 'oslash', 'questiondown', 'exclamdown', 'logicalnot', 'radical', 'florin', 'approxequal', 'Delta', 'guillemotleft', 'guillemotright', 'ellipsis', 'nonbreakingspace', 'Agrave', 'Atilde', 'Otilde', 'OE', 'oe', 'endash', 'emdash', 'quotedblleft', 'quotedblright', 'quoteleft', 'quoteright', 'divide', 'lozenge', 'ydieresis', 'Ydieresis', 'fraction', 'currency', 'guilsinglleft', 'guilsinglright', 'fi', 'fl', 'daggerdbl', 'periodcentered', 'quotesinglbase', 'quotedblbase', 'perthousand', 'Acircumflex', 'Ecircumflex', 'Aacute', 'Edieresis', 'Egrave', 'Iacute', 'Icircumflex', 'Idieresis', 'Igrave', 'Oacute', 'Ocircumflex', 'apple', 'Ograve', 'Uacute', 'Ucircumflex', 'Ugrave', 'dotlessi', 'circumflex', 'tilde', 'macron', 'breve', 'dotaccent', 'ring', 'cedilla', 'hungarumlaut', 'ogonek', 'caron', 'Lslash', 'lslash', 'Scaron', 'scaron', 'Zcaron', 'zcaron', 'brokenbar', 'Eth', 'eth', 'Yacute', 'yacute', 'Thorn', 'thorn', 'minus', 'multiply', 'onesuperior', 'twosuperior', 'threesuperior', 'onehalf', 'onequarter', 'threequarters', 'franc', 'Gbreve', 'gbreve', 'Idotaccent', 'Scedilla', 'scedilla', 'Cacute', 'cacute', 'Ccaron', 'ccaron', 'dcroat'];

var _class$7;
function _applyDecoratedDescriptor$4(target, property, decorators, descriptor, context) {
  var desc = {};
  Object['ke' + 'ys'](descriptor).forEach(function (key) {
    desc[key] = descriptor[key];
  });
  desc.enumerable = !!desc.enumerable;
  desc.configurable = !!desc.configurable;

  if ('value' in desc || desc.initializer) {
    desc.writable = true;
  }

  desc = decorators.slice().reverse().reduce(function (desc, decorator) {
    return decorator(target, property, desc) || desc;
  }, desc);

  if (context && desc.initializer !== void 0) {
    desc.value = desc.initializer ? desc.initializer.call(context) : void 0;
    desc.initializer = undefined;
  }

  if (desc.initializer === void 0) {
    Object['define' + 'Property'](target, property, desc);
    desc = null;
  }

  return desc;
}

/**
 * Glyph objects represent a glyph in the font. They have various properties for accessing metrics and
 * the actual vector path the glyph represents, and methods for rendering the glyph to a graphics context.
 *
 * You do not create glyph objects directly. They are created by various methods on the font object.
 * There are several subclasses of the base Glyph class internally that may be returned depending
 * on the font format, but they all inherit from this class.
 */
var Glyph = (_class$7 = function () {
  function Glyph(id, codePoints, font) {
    _classCallCheck(this, Glyph);

    /**
     * The glyph id in the font
     * @type {number}
     */
    this.id = id;

    /**
     * An array of unicode code points that are represented by this glyph.
     * There can be multiple code points in the case of ligatures and other glyphs
     * that represent multiple visual characters.
     * @type {number[]}
     */
    this.codePoints = codePoints;
    this._font = font;

    // TODO: get this info from GDEF if available
    this.isMark = this.codePoints.every(unicode.isMark);
    this.isLigature = this.codePoints.length > 1;
  }

  _createClass(Glyph, [{
    key: '_getPath',
    value: function _getPath() {
      return new Path();
    }
  }, {
    key: '_getCBox',
    value: function _getCBox() {
      return this.path.cbox;
    }
  }, {
    key: '_getBBox',
    value: function _getBBox() {
      return this.path.bbox;
    }
  }, {
    key: '_getTableMetrics',
    value: function _getTableMetrics(table) {
      if (this.id < table.metrics.length) {
        return table.metrics.get(this.id);
      }

      var metric = table.metrics.get(table.metrics.length - 1);
      var res = {
        advance: metric ? metric.advance : 0,
        bearing: table.bearings.get(this.id - table.metrics.length) || 0
      };

      return res;
    }
  }, {
    key: '_getMetrics',
    value: function _getMetrics(cbox) {
      if (this._metrics) {
        return this._metrics;
      }

      var _getTableMetrics2 = this._getTableMetrics(this._font.hmtx),
          advanceWidth = _getTableMetrics2.advance,
          leftBearing = _getTableMetrics2.bearing;

      // For vertical metrics, use vmtx if available, or fall back to global data from OS/2 or hhea


      if (this._font.vmtx) {
        var _getTableMetrics3 = this._getTableMetrics(this._font.vmtx),
            advanceHeight = _getTableMetrics3.advance,
            topBearing = _getTableMetrics3.bearing;
      } else {
        var os2 = void 0;
        if (typeof cbox === 'undefined' || cbox === null) {
          cbox = this.cbox;
        }

        if ((os2 = this._font['OS/2']) && os2.version > 0) {
          var advanceHeight = Math.abs(os2.typoAscender - os2.typoDescender);
          var topBearing = os2.typoAscender - cbox.maxY;
        } else {
          var hhea = this._font.hhea;

          var advanceHeight = Math.abs(hhea.ascent - hhea.descent);
          var topBearing = hhea.ascent - cbox.maxY;
        }
      }

      return this._metrics = { advanceWidth: advanceWidth, advanceHeight: advanceHeight, leftBearing: leftBearing, topBearing: topBearing };
    }

    /**
     * The glyph’s control box.
     * This is often the same as the bounding box, but is faster to compute.
     * Because of the way bezier curves are defined, some of the control points
     * can be outside of the bounding box. Where `bbox` takes this into account,
     * `cbox` does not. Thus, cbox is less accurate, but faster to compute.
     * See [here](http://www.freetype.org/freetype2/docs/glyphs/glyphs-6.html#section-2)
     * for a more detailed description.
     *
     * @type {BBox}
     */

  }, {
    key: '_getName',
    value: function _getName() {
      var post = this._font.post;

      if (!post) {
        return null;
      }

      switch (post.version) {
        case 1:
          return StandardNames[this.id];

        case 2:
          var id = post.glyphNameIndex[this.id];
          if (id < StandardNames.length) {
            return StandardNames[id];
          }

          return post.names[id - StandardNames.length];

        case 2.5:
          return StandardNames[this.id + post.offsets[this.id]];

        case 4:
          return String.fromCharCode(post.map[this.id]);
      }
    }

    /**
     * The glyph's name
     * @type {string}
     */

  }, {
    key: 'render',


    /**
     * Renders the glyph to the given graphics context, at the specified font size.
     * @param {CanvasRenderingContext2d} ctx
     * @param {number} size
     */
    value: function render(ctx, size) {
      ctx.save();

      var scale = 1 / this._font.head.unitsPerEm * size;
      ctx.scale(scale, scale);

      var fn = this.path.toFunction();
      fn(ctx);
      ctx.fill();

      ctx.restore();
    }
  }, {
    key: 'cbox',
    get: function get() {
      return this._getCBox();
    }

    /**
     * The glyph’s bounding box, i.e. the rectangle that encloses the
     * glyph outline as tightly as possible.
     * @type {BBox}
     */

  }, {
    key: 'bbox',
    get: function get() {
      return this._getBBox();
    }

    /**
     * A vector Path object representing the glyph outline.
     * @type {Path}
     */

  }, {
    key: 'path',
    get: function get() {
      // Cache the path so we only decode it once
      // Decoding is actually performed by subclasses
      return this._getPath();
    }

    /**
     * The glyph's advance width.
     * @type {number}
     */

  }, {
    key: 'advanceWidth',
    get: function get() {
      return this._getMetrics().advanceWidth;
    }

    /**
     * The glyph's advance height.
     * @type {number}
     */

  }, {
    key: 'advanceHeight',
    get: function get() {
      return this._getMetrics().advanceHeight;
    }
  }, {
    key: 'ligatureCaretPositions',
    get: function get() {}
  }, {
    key: 'name',
    get: function get() {
      return this._getName();
    }
  }]);

  return Glyph;
}(), (_applyDecoratedDescriptor$4(_class$7.prototype, 'cbox', [cache], _Object$getOwnPropertyDescriptor(_class$7.prototype, 'cbox'), _class$7.prototype), _applyDecoratedDescriptor$4(_class$7.prototype, 'bbox', [cache], _Object$getOwnPropertyDescriptor(_class$7.prototype, 'bbox'), _class$7.prototype), _applyDecoratedDescriptor$4(_class$7.prototype, 'path', [cache], _Object$getOwnPropertyDescriptor(_class$7.prototype, 'path'), _class$7.prototype), _applyDecoratedDescriptor$4(_class$7.prototype, 'advanceWidth', [cache], _Object$getOwnPropertyDescriptor(_class$7.prototype, 'advanceWidth'), _class$7.prototype), _applyDecoratedDescriptor$4(_class$7.prototype, 'advanceHeight', [cache], _Object$getOwnPropertyDescriptor(_class$7.prototype, 'advanceHeight'), _class$7.prototype), _applyDecoratedDescriptor$4(_class$7.prototype, 'name', [cache], _Object$getOwnPropertyDescriptor(_class$7.prototype, 'name'), _class$7.prototype)), _class$7);

// The header for both simple and composite glyphs
var GlyfHeader = new r.Struct({
  numberOfContours: r.int16, // if negative, this is a composite glyph
  xMin: r.int16,
  yMin: r.int16,
  xMax: r.int16,
  yMax: r.int16
});

// Flags for simple glyphs
var ON_CURVE = 1 << 0;
var X_SHORT_VECTOR = 1 << 1;
var Y_SHORT_VECTOR = 1 << 2;
var REPEAT = 1 << 3;
var SAME_X = 1 << 4;
var SAME_Y = 1 << 5;

// Flags for composite glyphs
var ARG_1_AND_2_ARE_WORDS = 1 << 0;
var WE_HAVE_A_SCALE = 1 << 3;
var MORE_COMPONENTS = 1 << 5;
var WE_HAVE_AN_X_AND_Y_SCALE = 1 << 6;
var WE_HAVE_A_TWO_BY_TWO = 1 << 7;
var WE_HAVE_INSTRUCTIONS = 1 << 8;
// Represents a point in a simple glyph
var Point = function () {
  function Point(onCurve, endContour) {
    var x = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    var y = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;

    _classCallCheck(this, Point);

    this.onCurve = onCurve;
    this.endContour = endContour;
    this.x = x;
    this.y = y;
  }

  _createClass(Point, [{
    key: 'copy',
    value: function copy() {
      return new Point(this.onCurve, this.endContour, this.x, this.y);
    }
  }]);

  return Point;
}();

// Represents a component in a composite glyph

var Component = function Component(glyphID, dx, dy) {
  _classCallCheck(this, Component);

  this.glyphID = glyphID;
  this.dx = dx;
  this.dy = dy;
  this.pos = 0;
  this.scaleX = this.scaleY = 1;
  this.scale01 = this.scale10 = 0;
};

/**
 * Represents a TrueType glyph.
 */


var TTFGlyph = function (_Glyph) {
  _inherits(TTFGlyph, _Glyph);

  function TTFGlyph() {
    _classCallCheck(this, TTFGlyph);

    return _possibleConstructorReturn(this, (TTFGlyph.__proto__ || _Object$getPrototypeOf(TTFGlyph)).apply(this, arguments));
  }

  _createClass(TTFGlyph, [{
    key: '_getCBox',

    // Parses just the glyph header and returns the bounding box
    value: function _getCBox(internal) {
      // We need to decode the glyph if variation processing is requested,
      // so it's easier just to recompute the path's cbox after decoding.
      if (this._font._variationProcessor && !internal) {
        return this.path.cbox;
      }

      var stream = this._font._getTableStream('glyf');
      stream.pos += this._font.loca.offsets[this.id];
      var glyph = GlyfHeader.decode(stream);

      var cbox = new BBox(glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax);
      return _Object$freeze(cbox);
    }

    // Parses a single glyph coordinate

  }, {
    key: '_parseGlyphCoord',
    value: function _parseGlyphCoord(stream, prev, short, same) {
      if (short) {
        var val = stream.readUInt8();
        if (!same) {
          val = -val;
        }

        val += prev;
      } else {
        if (same) {
          var val = prev;
        } else {
          var val = prev + stream.readInt16BE();
        }
      }

      return val;
    }

    // Decodes the glyph data into points for simple glyphs,
    // or components for composite glyphs

  }, {
    key: '_decode',
    value: function _decode() {
      var glyfPos = this._font.loca.offsets[this.id];
      var nextPos = this._font.loca.offsets[this.id + 1];

      // Nothing to do if there is no data for this glyph
      if (glyfPos === nextPos) {
        return null;
      }

      var stream = this._font._getTableStream('glyf');
      stream.pos += glyfPos;
      var startPos = stream.pos;

      var glyph = GlyfHeader.decode(stream);

      if (glyph.numberOfContours > 0) {
        this._decodeSimple(glyph, stream);
      } else if (glyph.numberOfContours < 0) {
        this._decodeComposite(glyph, stream, startPos);
      }

      return glyph;
    }
  }, {
    key: '_decodeSimple',
    value: function _decodeSimple(glyph, stream) {
      // this is a simple glyph
      glyph.points = [];

      var endPtsOfContours = new r.Array(r.uint16, glyph.numberOfContours).decode(stream);
      glyph.instructions = new r.Array(r.uint8, r.uint16).decode(stream);

      var flags = [];
      var numCoords = endPtsOfContours[endPtsOfContours.length - 1] + 1;

      while (flags.length < numCoords) {
        var flag = stream.readUInt8();
        flags.push(flag);

        // check for repeat flag
        if (flag & REPEAT) {
          var count = stream.readUInt8();
          for (var j = 0; j < count; j++) {
            flags.push(flag);
          }
        }
      }

      for (var i = 0; i < flags.length; i++) {
        var flag = flags[i];
        var point = new Point(!!(flag & ON_CURVE), endPtsOfContours.indexOf(i) >= 0, 0, 0);
        glyph.points.push(point);
      }

      var px = 0;
      for (var i = 0; i < flags.length; i++) {
        var flag = flags[i];
        glyph.points[i].x = px = this._parseGlyphCoord(stream, px, flag & X_SHORT_VECTOR, flag & SAME_X);
      }

      var py = 0;
      for (var i = 0; i < flags.length; i++) {
        var flag = flags[i];
        glyph.points[i].y = py = this._parseGlyphCoord(stream, py, flag & Y_SHORT_VECTOR, flag & SAME_Y);
      }

      if (this._font._variationProcessor) {
        var points = glyph.points.slice();
        points.push.apply(points, _toConsumableArray(this._getPhantomPoints(glyph)));

        this._font._variationProcessor.transformPoints(this.id, points);
        glyph.phantomPoints = points.slice(-4);
      }

      return;
    }
  }, {
    key: '_decodeComposite',
    value: function _decodeComposite(glyph, stream) {
      var offset = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

      // this is a composite glyph
      glyph.components = [];
      var haveInstructions = false;
      var flags = MORE_COMPONENTS;

      while (flags & MORE_COMPONENTS) {
        flags = stream.readUInt16BE();
        var gPos = stream.pos - offset;
        var glyphID = stream.readUInt16BE();
        if (!haveInstructions) {
          haveInstructions = (flags & WE_HAVE_INSTRUCTIONS) !== 0;
        }

        if (flags & ARG_1_AND_2_ARE_WORDS) {
          var dx = stream.readInt16BE();
          var dy = stream.readInt16BE();
        } else {
          var dx = stream.readInt8();
          var dy = stream.readInt8();
        }

        var component = new Component(glyphID, dx, dy);
        component.pos = gPos;

        if (flags & WE_HAVE_A_SCALE) {
          // fixed number with 14 bits of fraction
          component.scaleX = component.scaleY = (stream.readUInt8() << 24 | stream.readUInt8() << 16) / 1073741824;
        } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
          component.scaleX = (stream.readUInt8() << 24 | stream.readUInt8() << 16) / 1073741824;
          component.scaleY = (stream.readUInt8() << 24 | stream.readUInt8() << 16) / 1073741824;
        } else if (flags & WE_HAVE_A_TWO_BY_TWO) {
          component.scaleX = (stream.readUInt8() << 24 | stream.readUInt8() << 16) / 1073741824;
          component.scale01 = (stream.readUInt8() << 24 | stream.readUInt8() << 16) / 1073741824;
          component.scale10 = (stream.readUInt8() << 24 | stream.readUInt8() << 16) / 1073741824;
          component.scaleY = (stream.readUInt8() << 24 | stream.readUInt8() << 16) / 1073741824;
        }

        glyph.components.push(component);
      }

      if (this._font._variationProcessor) {
        var points = [];
        for (var j = 0; j < glyph.components.length; j++) {
          var component = glyph.components[j];
          points.push(new Point(true, true, component.dx, component.dy));
        }

        points.push.apply(points, _toConsumableArray(this._getPhantomPoints(glyph)));

        this._font._variationProcessor.transformPoints(this.id, points);
        glyph.phantomPoints = points.splice(-4, 4);

        for (var i = 0; i < points.length; i++) {
          var point = points[i];
          glyph.components[i].dx = point.x;
          glyph.components[i].dy = point.y;
        }
      }

      return haveInstructions;
    }
  }, {
    key: '_getPhantomPoints',
    value: function _getPhantomPoints(glyph) {
      var cbox = this._getCBox(true);
      if (this._metrics == null) {
        this._metrics = Glyph.prototype._getMetrics.call(this, cbox);
      }

      var _metrics = this._metrics,
          advanceWidth = _metrics.advanceWidth,
          advanceHeight = _metrics.advanceHeight,
          leftBearing = _metrics.leftBearing,
          topBearing = _metrics.topBearing;


      return [new Point(false, true, glyph.xMin - leftBearing, 0), new Point(false, true, glyph.xMin - leftBearing + advanceWidth, 0), new Point(false, true, 0, glyph.yMax + topBearing), new Point(false, true, 0, glyph.yMax + topBearing + advanceHeight)];
    }

    // Decodes font data, resolves composite glyphs, and returns an array of contours

  }, {
    key: '_getContours',
    value: function _getContours() {
      var glyph = this._decode();
      if (!glyph) {
        return [];
      }

      if (glyph.numberOfContours < 0) {
        // resolve composite glyphs
        var points = [];
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = _getIterator(glyph.components), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var component = _step.value;

            glyph = this._font.getGlyph(component.glyphID)._decode();
            // TODO transform
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
              for (var _iterator2 = _getIterator(glyph.points), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var _point = _step2.value;

                points.push(new Point(_point.onCurve, _point.endContour, _point.x + component.dx, _point.y + component.dy));
              }
            } catch (err) {
              _didIteratorError2 = true;
              _iteratorError2 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion2 && _iterator2.return) {
                  _iterator2.return();
                }
              } finally {
                if (_didIteratorError2) {
                  throw _iteratorError2;
                }
              }
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }
      } else {
        var points = glyph.points || [];
      }

      // Recompute and cache metrics if we performed variation processing
      if (glyph.phantomPoints) {
        this._metrics.advanceWidth = glyph.phantomPoints[1].x - glyph.phantomPoints[0].x;
        this._metrics.advanceHeight = glyph.phantomPoints[3].y - glyph.phantomPoints[2].y;
        this._metrics.leftBearing = glyph.xMin - glyph.phantomPoints[0].x;
        this._metrics.topBearing = glyph.phantomPoints[2].y - glyph.yMax;
      }

      var contours = [];
      var cur = [];
      for (var k = 0; k < points.length; k++) {
        var point = points[k];
        cur.push(point);
        if (point.endContour) {
          contours.push(cur);
          cur = [];
        }
      }

      return contours;
    }
  }, {
    key: '_getMetrics',
    value: function _getMetrics() {
      if (this._metrics) {
        return this._metrics;
      }

      var cbox = this._getCBox(true);
      _get(TTFGlyph.prototype.__proto__ || _Object$getPrototypeOf(TTFGlyph.prototype), '_getMetrics', this).call(this, cbox);

      if (this._font._variationProcessor) {
        // Decode the font data (and cache for later).
        // This triggers recomputation of metrics
        this.path;
      }

      return this._metrics;
    }

    // Converts contours to a Path object that can be rendered

  }, {
    key: '_getPath',
    value: function _getPath() {
      var contours = this._getContours();
      var path = new Path();

      for (var i = 0; i < contours.length; i++) {
        var contour = contours[i];
        var firstPt = contour[0];
        var lastPt = contour[contour.length - 1];
        var start = 0;

        if (firstPt.onCurve) {
          // The first point will be consumed by the moveTo command, so skip in the loop
          var curvePt = null;
          start = 1;
        } else {
          if (lastPt.onCurve) {
            // Start at the last point if the first point is off curve and the last point is on curve
            firstPt = lastPt;
          } else {
            // Start at the middle if both the first and last points are off curve
            firstPt = new Point(false, false, (firstPt.x + lastPt.x) / 2, (firstPt.y + lastPt.y) / 2);
          }

          var curvePt = firstPt;
        }

        path.moveTo(firstPt.x, firstPt.y);

        for (var j = start; j < contour.length; j++) {
          var pt = contour[j];
          var prevPt = j === 0 ? firstPt : contour[j - 1];

          if (prevPt.onCurve && pt.onCurve) {
            path.lineTo(pt.x, pt.y);
          } else if (prevPt.onCurve && !pt.onCurve) {
            var curvePt = pt;
          } else if (!prevPt.onCurve && !pt.onCurve) {
            var midX = (prevPt.x + pt.x) / 2;
            var midY = (prevPt.y + pt.y) / 2;
            path.quadraticCurveTo(prevPt.x, prevPt.y, midX, midY);
            var curvePt = pt;
          } else if (!prevPt.onCurve && pt.onCurve) {
            path.quadraticCurveTo(curvePt.x, curvePt.y, pt.x, pt.y);
            var curvePt = null;
          } else {
            throw new Error("Unknown TTF path state");
          }
        }

        // Connect the first and last points
        if (curvePt) {
          path.quadraticCurveTo(curvePt.x, curvePt.y, firstPt.x, firstPt.y);
        }

        path.closePath();
      }

      return path;
    }
  }]);

  return TTFGlyph;
}(Glyph);

/**
 * Represents an OpenType PostScript glyph, in the Compact Font Format.
 */

var CFFGlyph = function (_Glyph) {
  _inherits(CFFGlyph, _Glyph);

  function CFFGlyph() {
    _classCallCheck(this, CFFGlyph);

    return _possibleConstructorReturn(this, (CFFGlyph.__proto__ || _Object$getPrototypeOf(CFFGlyph)).apply(this, arguments));
  }

  _createClass(CFFGlyph, [{
    key: '_getName',
    value: function _getName() {
      return this._font['CFF '].getGlyphName(this.id);
    }
  }, {
    key: 'bias',
    value: function bias(s) {
      if (s.length < 1240) {
        return 107;
      } else if (s.length < 33900) {
        return 1131;
      } else {
        return 32768;
      }
    }
  }, {
    key: '_getPath',
    value: function _getPath() {
      var stream = this._font.stream;
      var pos = stream.pos;


      var cff = this._font['CFF '];
      var str = cff.topDict.CharStrings[this.id];
      var end = str.offset + str.length;
      stream.pos = str.offset;

      var path = new Path();
      var stack = [];
      var trans = [];

      var width = null;
      var nStems = 0;
      var x = 0,
          y = 0;
      var usedGsubrs = void 0;
      var usedSubrs = void 0;
      var open = false;

      this._usedGsubrs = usedGsubrs = {};
      this._usedSubrs = usedSubrs = {};

      var gsubrs = cff.globalSubrIndex || [];
      var gsubrsBias = this.bias(gsubrs);

      var privateDict = cff.privateDictForGlyph(this.id);
      var subrs = privateDict.Subrs || [];
      var subrsBias = this.bias(subrs);

      function parseStems() {
        if (stack.length % 2 !== 0) {
          if (width === null) {
            width = stack.shift() + privateDict.nominalWidthX;
          }
        }

        nStems += stack.length >> 1;
        return stack.length = 0;
      }

      function moveTo(x, y) {
        if (open) {
          path.closePath();
        }

        path.moveTo(x, y);
        open = true;
      }

      var parse = function parse() {
        while (stream.pos < end) {
          var op = stream.readUInt8();
          if (op < 32) {
            switch (op) {
              case 1: // hstem
              case 3: // vstem
              case 18: // hstemhm
              case 23:
                // vstemhm
                parseStems();
                break;

              case 4:
                // vmoveto
                if (stack.length > 1) {
                  if (typeof width === 'undefined' || width === null) {
                    width = stack.shift() + privateDict.nominalWidthX;
                  }
                }

                y += stack.shift();
                moveTo(x, y);
                break;

              case 5:
                // rlineto
                while (stack.length >= 2) {
                  x += stack.shift();
                  y += stack.shift();
                  path.lineTo(x, y);
                }
                break;

              case 6: // hlineto
              case 7:
                // vlineto
                var phase = op === 6;
                while (stack.length >= 1) {
                  if (phase) {
                    x += stack.shift();
                  } else {
                    y += stack.shift();
                  }

                  path.lineTo(x, y);
                  phase = !phase;
                }
                break;

              case 8:
                // rrcurveto
                while (stack.length > 0) {
                  var c1x = x + stack.shift();
                  var c1y = y + stack.shift();
                  var c2x = c1x + stack.shift();
                  var c2y = c1y + stack.shift();
                  x = c2x + stack.shift();
                  y = c2y + stack.shift();
                  path.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
                }
                break;

              case 10:
                // callsubr
                var index = stack.pop() + subrsBias;
                var subr = subrs[index];
                if (subr) {
                  usedSubrs[index] = true;
                  var p = stream.pos;
                  var e = end;
                  stream.pos = subr.offset;
                  end = subr.offset + subr.length;
                  parse();
                  stream.pos = p;
                  end = e;
                }
                break;

              case 11:
                // return
                return;

              case 14:
                // endchar
                if (stack.length > 0) {
                  if (typeof width === 'undefined' || width === null) {
                    width = stack.shift() + privateDict.nominalWidthX;
                  }
                }

                path.closePath();
                open = false;
                break;

              case 19: // hintmask
              case 20:
                // cntrmask
                parseStems();
                stream.pos += nStems + 7 >> 3;
                break;

              case 21:
                // rmoveto
                if (stack.length > 2) {
                  if (typeof width === 'undefined' || width === null) {
                    width = stack.shift() + privateDict.nominalWidthX;
                  }
                  var haveWidth = true;
                }

                x += stack.shift();
                y += stack.shift();
                moveTo(x, y);
                break;

              case 22:
                // hmoveto
                if (stack.length > 1) {
                  if (typeof width === 'undefined' || width === null) {
                    width = stack.shift() + privateDict.nominalWidthX;
                  }
                }

                x += stack.shift();
                moveTo(x, y);
                break;

              case 24:
                // rcurveline
                while (stack.length >= 8) {
                  var c1x = x + stack.shift();
                  var c1y = y + stack.shift();
                  var c2x = c1x + stack.shift();
                  var c2y = c1y + stack.shift();
                  x = c2x + stack.shift();
                  y = c2y + stack.shift();
                  path.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
                }

                x += stack.shift();
                y += stack.shift();
                path.lineTo(x, y);
                break;

              case 25:
                // rlinecurve
                while (stack.length >= 8) {
                  x += stack.shift();
                  y += stack.shift();
                  path.lineTo(x, y);
                }

                var c1x = x + stack.shift();
                var c1y = y + stack.shift();
                var c2x = c1x + stack.shift();
                var c2y = c1y + stack.shift();
                x = c2x + stack.shift();
                y = c2y + stack.shift();
                path.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
                break;

              case 26:
                // vvcurveto
                if (stack.length % 2) {
                  x += stack.shift();
                }

                while (stack.length >= 4) {
                  c1x = x;
                  c1y = y + stack.shift();
                  c2x = c1x + stack.shift();
                  c2y = c1y + stack.shift();
                  x = c2x;
                  y = c2y + stack.shift();
                  path.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
                }
                break;

              case 27:
                // hhcurveto
                if (stack.length % 2) {
                  y += stack.shift();
                }

                while (stack.length >= 4) {
                  c1x = x + stack.shift();
                  c1y = y;
                  c2x = c1x + stack.shift();
                  c2y = c1y + stack.shift();
                  x = c2x + stack.shift();
                  y = c2y;
                  path.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
                }
                break;

              case 28:
                // shortint
                stack.push(stream.readInt16BE());
                break;

              case 29:
                // callgsubr
                index = stack.pop() + gsubrsBias;
                subr = gsubrs[index];
                if (subr) {
                  usedGsubrs[index] = true;
                  var p = stream.pos;
                  var e = end;
                  stream.pos = subr.offset;
                  end = subr.offset + subr.length;
                  parse();
                  stream.pos = p;
                  end = e;
                }
                break;

              case 30: // vhcurveto
              case 31:
                // hvcurveto
                phase = op === 31;
                while (stack.length >= 4) {
                  if (phase) {
                    c1x = x + stack.shift();
                    c1y = y;
                    c2x = c1x + stack.shift();
                    c2y = c1y + stack.shift();
                    y = c2y + stack.shift();
                    x = c2x + (stack.length === 1 ? stack.shift() : 0);
                  } else {
                    c1x = x;
                    c1y = y + stack.shift();
                    c2x = c1x + stack.shift();
                    c2y = c1y + stack.shift();
                    x = c2x + stack.shift();
                    y = c2y + (stack.length === 1 ? stack.shift() : 0);
                  }

                  path.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
                  phase = !phase;
                }
                break;

              case 12:
                op = stream.readUInt8();
                switch (op) {
                  case 3:
                    // and
                    var a = stack.pop();
                    var b = stack.pop();
                    stack.push(a && b ? 1 : 0);
                    break;

                  case 4:
                    // or
                    a = stack.pop();
                    b = stack.pop();
                    stack.push(a || b ? 1 : 0);
                    break;

                  case 5:
                    // not
                    a = stack.pop();
                    stack.push(a ? 0 : 1);
                    break;

                  case 9:
                    // abs
                    a = stack.pop();
                    stack.push(Math.abs(a));
                    break;

                  case 10:
                    // add
                    a = stack.pop();
                    b = stack.pop();
                    stack.push(a + b);
                    break;

                  case 11:
                    // sub
                    a = stack.pop();
                    b = stack.pop();
                    stack.push(a - b);
                    break;

                  case 12:
                    // div
                    a = stack.pop();
                    b = stack.pop();
                    stack.push(a / b);
                    break;

                  case 14:
                    // neg
                    a = stack.pop();
                    stack.push(-a);
                    break;

                  case 15:
                    // eq
                    a = stack.pop();
                    b = stack.pop();
                    stack.push(a === b ? 1 : 0);
                    break;

                  case 18:
                    // drop
                    stack.pop();
                    break;

                  case 20:
                    // put
                    var val = stack.pop();
                    var idx = stack.pop();
                    trans[idx] = val;
                    break;

                  case 21:
                    // get
                    idx = stack.pop();
                    stack.push(trans[idx] || 0);
                    break;

                  case 22:
                    // ifelse
                    var s1 = stack.pop();
                    var s2 = stack.pop();
                    var v1 = stack.pop();
                    var v2 = stack.pop();
                    stack.push(v1 <= v2 ? s1 : s2);
                    break;

                  case 23:
                    // random
                    stack.push(Math.random());
                    break;

                  case 24:
                    // mul
                    a = stack.pop();
                    b = stack.pop();
                    stack.push(a * b);
                    break;

                  case 26:
                    // sqrt
                    a = stack.pop();
                    stack.push(Math.sqrt(a));
                    break;

                  case 27:
                    // dup
                    a = stack.pop();
                    stack.push(a, a);
                    break;

                  case 28:
                    // exch
                    a = stack.pop();
                    b = stack.pop();
                    stack.push(b, a);
                    break;

                  case 29:
                    // index
                    idx = stack.pop();
                    if (idx < 0) {
                      idx = 0;
                    } else if (idx > stack.length - 1) {
                      idx = stack.length - 1;
                    }

                    stack.push(stack[idx]);
                    break;

                  case 30:
                    // roll
                    var n = stack.pop();
                    var j = stack.pop();

                    if (j >= 0) {
                      while (j > 0) {
                        var t = stack[n - 1];
                        for (var i = n - 2; i >= 0; i--) {
                          stack[i + 1] = stack[i];
                        }

                        stack[0] = t;
                        j--;
                      }
                    } else {
                      while (j < 0) {
                        var t = stack[0];
                        for (var _i = 0; _i <= n; _i++) {
                          stack[_i] = stack[_i + 1];
                        }

                        stack[n - 1] = t;
                        j++;
                      }
                    }
                    break;

                  case 34:
                    // hflex
                    c1x = x + stack.shift();
                    c1y = y;
                    c2x = c1x + stack.shift();
                    c2y = c1y + stack.shift();
                    var c3x = c2x + stack.shift();
                    var c3y = c2y;
                    var c4x = c3x + stack.shift();
                    var c4y = c3y;
                    var c5x = c4x + stack.shift();
                    var c5y = c4y;
                    var c6x = c5x + stack.shift();
                    var c6y = c5y;
                    x = c6x;
                    y = c6y;

                    path.bezierCurveTo(c1x, c1y, c2x, c2y, c3x, c3y);
                    path.bezierCurveTo(c4x, c4y, c5x, c5y, c6x, c6y);
                    break;

                  case 35:
                    // flex
                    var pts = [];

                    for (var _i2 = 0; _i2 <= 5; _i2++) {
                      x += stack.shift();
                      y += stack.shift();
                      pts.push(x, y);
                    }

                    path.bezierCurveTo.apply(path, _toConsumableArray(pts.slice(0, 6)));
                    path.bezierCurveTo.apply(path, _toConsumableArray(pts.slice(6)));
                    stack.shift(); // fd
                    break;

                  case 36:
                    // hflex1
                    c1x = x + stack.shift();
                    c1y = y + stack.shift();
                    c2x = c1x + stack.shift();
                    c2y = c1y + stack.shift();
                    c3x = c2x + stack.shift();
                    c3y = c2y;
                    c4x = c3x + stack.shift();
                    c4y = c3y;
                    c5x = c4x + stack.shift();
                    c5y = c4y + stack.shift();
                    c6x = c5x + stack.shift();
                    c6y = c5y;
                    x = c6x;
                    y = c6y;

                    path.bezierCurveTo(c1x, c1y, c2x, c2y, c3x, c3y);
                    path.bezierCurveTo(c4x, c4y, c5x, c5y, c6x, c6y);
                    break;

                  case 37:
                    // flex1
                    var startx = x;
                    var starty = y;

                    pts = [];
                    for (var _i3 = 0; _i3 <= 4; _i3++) {
                      x += stack.shift();
                      y += stack.shift();
                      pts.push(x, y);
                    }

                    if (Math.abs(x - startx) > Math.abs(y - starty)) {
                      // horizontal
                      x += stack.shift();
                      y = starty;
                    } else {
                      x = startx;
                      y += stack.shift();
                    }

                    pts.push(x, y);
                    path.bezierCurveTo.apply(path, _toConsumableArray(pts.slice(0, 6)));
                    path.bezierCurveTo.apply(path, _toConsumableArray(pts.slice(6)));
                    break;

                  default:
                    throw new Error('Unknown op: 12 ' + op);
                }
                break;

              default:
                throw new Error('Unknown op: ' + op);
            }
          } else if (op < 247) {
            stack.push(op - 139);
          } else if (op < 251) {
            var b1 = stream.readUInt8();
            stack.push((op - 247) * 256 + b1 + 108);
          } else if (op < 255) {
            var b1 = stream.readUInt8();
            stack.push(-(op - 251) * 256 - b1 - 108);
          } else {
            stack.push(stream.readInt32BE() / 65536);
          }
        }
      };

      parse();
      return path;
    }
  }]);

  return CFFGlyph;
}(Glyph);

var SBIXImage = new r.Struct({
  originX: r.uint16,
  originY: r.uint16,
  type: new r.String(4),
  data: new r.Buffer(function (t) {
    return t.parent.buflen - t._currentOffset;
  })
});

/**
 * Represents a color (e.g. emoji) glyph in Apple's SBIX format.
 */

var SBIXGlyph = function (_TTFGlyph) {
  _inherits(SBIXGlyph, _TTFGlyph);

  function SBIXGlyph() {
    _classCallCheck(this, SBIXGlyph);

    return _possibleConstructorReturn(this, (SBIXGlyph.__proto__ || _Object$getPrototypeOf(SBIXGlyph)).apply(this, arguments));
  }

  _createClass(SBIXGlyph, [{
    key: 'getImageForSize',

    /**
     * Returns an object representing a glyph image at the given point size.
     * The object has a data property with a Buffer containing the actual image data,
     * along with the image type, and origin.
     *
     * @param {number} size
     * @return {object}
     */
    value: function getImageForSize(size) {
      for (var i = 0; i < this._font.sbix.imageTables.length; i++) {
        var table = this._font.sbix.imageTables[i];
        if (table.ppem >= size) {
          break;
        }
      }

      var offsets = table.imageOffsets;
      var start = offsets[this.id];
      var end = offsets[this.id + 1];

      if (start === end) {
        return null;
      }

      this._font.stream.pos = start;
      return SBIXImage.decode(this._font.stream, { buflen: end - start });
    }
  }, {
    key: 'render',
    value: function render(ctx, size) {
      var img = this.getImageForSize(size);
      if (img != null) {
        var scale = size / this._font.unitsPerEm;
        ctx.image(img.data, { height: size, x: img.originX, y: (this.bbox.minY - img.originY) * scale });
      }

      if (this._font.sbix.flags.renderOutlines) {
        _get(SBIXGlyph.prototype.__proto__ || _Object$getPrototypeOf(SBIXGlyph.prototype), 'render', this).call(this, ctx, size);
      }
    }
  }]);

  return SBIXGlyph;
}(TTFGlyph);

var COLRLayer = function COLRLayer(glyph, color) {
  _classCallCheck(this, COLRLayer);

  this.glyph = glyph;
  this.color = color;
};

/**
 * Represents a color (e.g. emoji) glyph in Microsoft's COLR format.
 * Each glyph in this format contain a list of colored layers, each
 * of which  is another vector glyph.
 */


var COLRGlyph = function (_Glyph) {
  _inherits(COLRGlyph, _Glyph);

  function COLRGlyph() {
    _classCallCheck(this, COLRGlyph);

    return _possibleConstructorReturn(this, (COLRGlyph.__proto__ || _Object$getPrototypeOf(COLRGlyph)).apply(this, arguments));
  }

  _createClass(COLRGlyph, [{
    key: '_getBBox',
    value: function _getBBox() {
      var bbox = new BBox();
      for (var i = 0; i < this.layers.length; i++) {
        var layer = this.layers[i];
        var b = layer.glyph.bbox;
        bbox.addPoint(b.minX, b.minY);
        bbox.addPoint(b.maxX, b.maxY);
      }

      return bbox;
    }

    /**
     * Returns an array of objects containing the glyph and color for
     * each layer in the composite color glyph.
     * @type {object[]}
     */

  }, {
    key: 'render',
    value: function render(ctx, size) {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(this.layers), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var _step$value = _step.value,
              glyph = _step$value.glyph,
              color = _step$value.color;

          ctx.fillColor([color.red, color.green, color.blue], color.alpha / 255 * 100);
          glyph.render(ctx, size);
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return;
    }
  }, {
    key: 'layers',
    get: function get() {
      var cpal = this._font.CPAL;
      var colr = this._font.COLR;
      var low = 0;
      var high = colr.baseGlyphRecord.length - 1;

      while (low <= high) {
        var mid = low + high >> 1;
        var rec = colr.baseGlyphRecord[mid];

        if (this.id < rec.gid) {
          high = mid - 1;
        } else if (this.id > rec.gid) {
          low = mid + 1;
        } else {
          var baseLayer = rec;
          break;
        }
      }

      // if base glyph not found in COLR table,
      // default to normal glyph from glyf or CFF
      if (baseLayer == null) {
        var g = this._font._getBaseGlyph(this.id);
        var color = {
          red: 0,
          green: 0,
          blue: 0,
          alpha: 255
        };

        return [new COLRLayer(g, color)];
      }

      // otherwise, return an array of all the layers
      var layers = [];
      for (var i = baseLayer.firstLayerIndex; i < baseLayer.firstLayerIndex + baseLayer.numLayers; i++) {
        var rec = colr.layerRecords[i];
        var color = cpal.colorRecords[rec.paletteIndex];
        var g = this._font._getBaseGlyph(rec.gid);
        layers.push(new COLRLayer(g, color));
      }

      return layers;
    }
  }]);

  return COLRGlyph;
}(Glyph);

var TUPLES_SHARE_POINT_NUMBERS = 0x8000;
var TUPLE_COUNT_MASK = 0x0fff;
var EMBEDDED_TUPLE_COORD = 0x8000;
var INTERMEDIATE_TUPLE = 0x4000;
var PRIVATE_POINT_NUMBERS = 0x2000;
var TUPLE_INDEX_MASK = 0x0fff;
var POINTS_ARE_WORDS = 0x80;
var POINT_RUN_COUNT_MASK = 0x7f;
var DELTAS_ARE_ZERO = 0x80;
var DELTAS_ARE_WORDS = 0x40;
var DELTA_RUN_COUNT_MASK = 0x3f;

/**
 * This class is transforms TrueType glyphs according to the data from
 * the Apple Advanced Typography variation tables (fvar, gvar, and avar).
 * These tables allow infinite adjustments to glyph weight, width, slant,
 * and optical size without the designer needing to specify every exact style.
 *
 * Apple's documentation for these tables is not great, so thanks to the
 * Freetype project for figuring much of this out.
 *
 * @private
 */

var GlyphVariationProcessor = function () {
  function GlyphVariationProcessor(font, coords) {
    _classCallCheck(this, GlyphVariationProcessor);

    this.font = font;
    this.normalizedCoords = this.normalizeCoords(coords);
  }

  _createClass(GlyphVariationProcessor, [{
    key: 'normalizeCoords',
    value: function normalizeCoords(coords) {
      // the default mapping is linear along each axis, in two segments:
      // from the minValue to defaultValue, and from defaultValue to maxValue.
      var normalized = [];
      for (var i = 0; i < this.font.fvar.axis.length; i++) {
        var axis = this.font.fvar.axis[i];
        if (coords[i] < axis.defaultValue) {
          normalized.push((coords[i] - axis.defaultValue) / (axis.defaultValue - axis.minValue));
        } else {
          normalized.push((coords[i] - axis.defaultValue) / (axis.maxValue - axis.defaultValue));
        }
      }

      // if there is an avar table, the normalized value is calculated
      // by interpolating between the two nearest mapped values.
      if (this.font.avar) {
        for (var i = 0; i < this.font.avar.segment.length; i++) {
          var segment = this.font.avar.segment[i];
          for (var j = 0; j < segment.correspondence.length; j++) {
            var pair = segment.correspondence[j];
            if (j >= 1 && normalized[i] < pair.fromCoord) {
              var prev = segment.correspondence[j - 1];
              normalized[i] = (normalized[i] - prev.fromCoord) * (pair.toCoord - prev.toCoord) / (pair.fromCoord - prev.fromCoord) + prev.toCoord;

              break;
            }
          }
        }
      }

      return normalized;
    }
  }, {
    key: 'transformPoints',
    value: function transformPoints(gid, glyphPoints) {
      if (!this.font.fvar || !this.font.gvar) {
        return;
      }

      var gvar = this.font.gvar;

      if (gid >= gvar.glyphCount) {
        return;
      }

      var offset = gvar.offsets[gid];
      if (offset === gvar.offsets[gid + 1]) {
        return;
      }

      // Read the gvar data for this glyph
      var stream = this.font.stream;

      stream.pos = offset;
      if (stream.pos >= stream.length) {
        return;
      }

      var tupleCount = stream.readUInt16BE();
      var offsetToData = offset + stream.readUInt16BE();

      if (tupleCount & TUPLES_SHARE_POINT_NUMBERS) {
        var here = stream.pos;
        stream.pos = offsetToData;
        var sharedPoints = this.decodePoints();
        offsetToData = stream.pos;
        stream.pos = here;
      }

      var origPoints = glyphPoints.map(function (pt) {
        return pt.copy();
      });

      tupleCount &= TUPLE_COUNT_MASK;
      for (var i = 0; i < tupleCount; i++) {
        var tupleDataSize = stream.readUInt16BE();
        var tupleIndex = stream.readUInt16BE();

        if (tupleIndex & EMBEDDED_TUPLE_COORD) {
          var tupleCoords = [];
          for (var a = 0; a < gvar.axisCount; a++) {
            tupleCoords.push(stream.readInt16BE() / 16384);
          }
        } else {
          if ((tupleIndex & TUPLE_INDEX_MASK) >= gvar.globalCoordCount) {
            throw new Error('Invalid gvar table');
          }

          var tupleCoords = gvar.globalCoords[tupleIndex & TUPLE_INDEX_MASK];
        }

        if (tupleIndex & INTERMEDIATE_TUPLE) {
          var startCoords = [];
          for (var _a = 0; _a < gvar.axisCount; _a++) {
            startCoords.push(stream.readInt16BE() / 16384);
          }

          var endCoords = [];
          for (var _a2 = 0; _a2 < gvar.axisCount; _a2++) {
            endCoords.push(stream.readInt16BE() / 16384);
          }
        }

        // Get the factor at which to apply this tuple
        var factor = this.tupleFactor(tupleIndex, tupleCoords, startCoords, endCoords);
        if (factor === 0) {
          offsetToData += tupleDataSize;
          continue;
        }

        var here = stream.pos;
        stream.pos = offsetToData;

        if (tupleIndex & PRIVATE_POINT_NUMBERS) {
          var points = this.decodePoints();
        } else {
          var points = sharedPoints;
        }

        // points.length = 0 means there are deltas for all points
        var nPoints = points.length === 0 ? glyphPoints.length : points.length;
        var xDeltas = this.decodeDeltas(nPoints);
        var yDeltas = this.decodeDeltas(nPoints);

        if (points.length === 0) {
          // all points
          for (var _i = 0; _i < glyphPoints.length; _i++) {
            var point = glyphPoints[_i];
            point.x += Math.round(xDeltas[_i] * factor);
            point.y += Math.round(yDeltas[_i] * factor);
          }
        } else {
          var outPoints = origPoints.map(function (pt) {
            return pt.copy();
          });
          var hasDelta = glyphPoints.map(function () {
            return false;
          });

          for (var _i2 = 0; _i2 < points.length; _i2++) {
            var idx = points[_i2];
            if (idx < glyphPoints.length) {
              var _point = outPoints[idx];
              hasDelta[idx] = true;

              _point.x += Math.round(xDeltas[_i2] * factor);
              _point.y += Math.round(yDeltas[_i2] * factor);
            }
          }

          this.interpolateMissingDeltas(outPoints, origPoints, hasDelta);

          for (var _i3 = 0; _i3 < glyphPoints.length; _i3++) {
            var deltaX = outPoints[_i3].x - origPoints[_i3].x;
            var deltaY = outPoints[_i3].y - origPoints[_i3].y;

            glyphPoints[_i3].x += deltaX;
            glyphPoints[_i3].y += deltaY;
          }
        }

        offsetToData += tupleDataSize;
        stream.pos = here;
      }
    }
  }, {
    key: 'decodePoints',
    value: function decodePoints() {
      var stream = this.font.stream;
      var count = stream.readUInt8();

      if (count & POINTS_ARE_WORDS) {
        count = (count & POINT_RUN_COUNT_MASK) << 8 | stream.readUInt8();
      }

      var points = new Uint16Array(count);
      var i = 0;
      var point = 0;
      while (i < count) {
        var run = stream.readUInt8();
        var runCount = (run & POINT_RUN_COUNT_MASK) + 1;
        var fn = run & POINTS_ARE_WORDS ? stream.readUInt16 : stream.readUInt8;

        for (var j = 0; j < runCount && i < count; j++) {
          point += fn.call(stream);
          points[i++] = point;
        }
      }

      return points;
    }
  }, {
    key: 'decodeDeltas',
    value: function decodeDeltas(count) {
      var stream = this.font.stream;
      var i = 0;
      var deltas = new Int16Array(count);

      while (i < count) {
        var run = stream.readUInt8();
        var runCount = (run & DELTA_RUN_COUNT_MASK) + 1;

        if (run & DELTAS_ARE_ZERO) {
          i += runCount;
        } else {
          var fn = run & DELTAS_ARE_WORDS ? stream.readInt16BE : stream.readInt8;
          for (var j = 0; j < runCount && i < count; j++) {
            deltas[i++] = fn.call(stream);
          }
        }
      }

      return deltas;
    }
  }, {
    key: 'tupleFactor',
    value: function tupleFactor(tupleIndex, tupleCoords, startCoords, endCoords) {
      var normalized = this.normalizedCoords;
      var gvar = this.font.gvar;

      var factor = 1;

      for (var i = 0; i < gvar.axisCount; i++) {
        if (tupleCoords[i] === 0) {
          continue;
        }

        if (normalized[i] === 0) {
          return 0;
        }

        if ((tupleIndex & INTERMEDIATE_TUPLE) === 0) {
          if (normalized[i] < Math.min(0, tupleCoords[i]) || normalized[i] > Math.max(0, tupleCoords[i])) {
            return 0;
          }

          factor = factor * normalized[i] / tupleCoords[i];
        } else {
          if (normalized[i] < startCoords[i] || normalized[i] > endCoords[i]) {
            return 0;
          } else if (normalized[i] < tupleCoords[i]) {
            factor = factor * (normalized[i] - startCoords[i]) / (tupleCoords[i] - startCoords[i]);
          } else {
            factor = factor * (endCoords[i] - normalized[i]) / (endCoords[i] - tupleCoords[i]);
          }
        }
      }

      return factor;
    }

    // Interpolates points without delta values.
    // Needed for the Ø and Q glyphs in Skia.
    // Algorithm from Freetype.

  }, {
    key: 'interpolateMissingDeltas',
    value: function interpolateMissingDeltas(points, inPoints, hasDelta) {
      if (points.length === 0) {
        return;
      }

      var point = 0;
      while (point < points.length) {
        var firstPoint = point;

        // find the end point of the contour
        var endPoint = point;
        var pt = points[endPoint];
        while (!pt.endContour) {
          pt = points[++endPoint];
        }

        // find the first point that has a delta
        while (point <= endPoint && !hasDelta[point]) {
          point++;
        }

        if (point > endPoint) {
          continue;
        }

        var firstDelta = point;
        var curDelta = point;
        point++;

        while (point <= endPoint) {
          // find the next point with a delta, and interpolate intermediate points
          if (hasDelta[point]) {
            this.deltaInterpolate(curDelta + 1, point - 1, curDelta, point, inPoints, points);
            curDelta = point;
          }

          point++;
        }

        // shift contour if we only have a single delta
        if (curDelta === firstDelta) {
          this.deltaShift(firstPoint, endPoint, curDelta, inPoints, points);
        } else {
          // otherwise, handle the remaining points at the end and beginning of the contour
          this.deltaInterpolate(curDelta + 1, endPoint, curDelta, firstDelta, inPoints, points);

          if (firstDelta > 0) {
            this.deltaInterpolate(firstPoint, firstDelta - 1, curDelta, firstDelta, inPoints, points);
          }
        }

        point = endPoint + 1;
      }
    }
  }, {
    key: 'deltaInterpolate',
    value: function deltaInterpolate(p1, p2, ref1, ref2, inPoints, outPoints) {
      if (p1 > p2) {
        return;
      }

      var iterable = ['x', 'y'];
      for (var i = 0; i < iterable.length; i++) {
        var k = iterable[i];
        if (inPoints[ref1][k] > inPoints[ref2][k]) {
          var p = ref1;
          ref1 = ref2;
          ref2 = p;
        }

        var in1 = inPoints[ref1][k];
        var in2 = inPoints[ref2][k];
        var out1 = outPoints[ref1][k];
        var out2 = outPoints[ref2][k];

        var scale = in1 === in2 ? 0 : (out2 - out1) / (in2 - in1);

        for (var _p = p1; _p <= p2; _p++) {
          var out = inPoints[_p][k];

          if (out <= in1) {
            out += out1 - in1;
          } else if (out >= in2) {
            out += out2 - in2;
          } else {
            out = out1 + (out - in1) * scale;
          }

          outPoints[_p][k] = out;
        }
      }
    }
  }, {
    key: 'deltaShift',
    value: function deltaShift(p1, p2, ref, inPoints, outPoints) {
      var deltaX = outPoints[ref].x - inPoints[ref].x;
      var deltaY = outPoints[ref].y - inPoints[ref].y;

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      for (var p = p1; p <= p2; p++) {
        if (p !== ref) {
          outPoints[p].x += deltaX;
          outPoints[p].y += deltaY;
        }
      }
    }
  }]);

  return GlyphVariationProcessor;
}();

var Subset = function () {
  function Subset(font) {
    _classCallCheck(this, Subset);

    this.font = font;
    this.glyphs = [];
    this.mapping = {};

    // always include the missing glyph
    this.includeGlyph(0);
  }

  _createClass(Subset, [{
    key: 'includeGlyph',
    value: function includeGlyph(glyph) {
      if ((typeof glyph === 'undefined' ? 'undefined' : _typeof(glyph)) === 'object') {
        glyph = glyph.id;
      }

      if (this.mapping[glyph] == null) {
        this.glyphs.push(glyph);
        this.mapping[glyph] = this.glyphs.length - 1;
      }

      return this.mapping[glyph];
    }
  }, {
    key: 'encodeStream',
    value: function encodeStream() {
      var _this = this;

      var s = new r.EncodeStream();

      process.nextTick(function () {
        _this.encode(s);
        return s.end();
      });

      return s;
    }
  }]);

  return Subset;
}();

// Flags for simple glyphs
var ON_CURVE$1 = 1 << 0;
var X_SHORT_VECTOR$1 = 1 << 1;
var Y_SHORT_VECTOR$1 = 1 << 2;
var REPEAT$1 = 1 << 3;
var SAME_X$1 = 1 << 4;
var SAME_Y$1 = 1 << 5;

var Point$1 = function () {
  function Point() {
    _classCallCheck(this, Point);
  }

  _createClass(Point, null, [{
    key: 'size',
    value: function size(val) {
      return val >= 0 && val <= 255 ? 1 : 2;
    }
  }, {
    key: 'encode',
    value: function encode(stream, value) {
      if (value >= 0 && value <= 255) {
        stream.writeUInt8(value);
      } else {
        stream.writeInt16BE(value);
      }
    }
  }]);

  return Point;
}();

var Glyf = new r.Struct({
  numberOfContours: r.int16, // if negative, this is a composite glyph
  xMin: r.int16,
  yMin: r.int16,
  xMax: r.int16,
  yMax: r.int16,
  endPtsOfContours: new r.Array(r.uint16, 'numberOfContours'),
  instructions: new r.Array(r.uint8, r.uint16),
  flags: new r.Array(r.uint8, 0),
  xPoints: new r.Array(Point$1, 0),
  yPoints: new r.Array(Point$1, 0)
});

/**
 * Encodes TrueType glyph outlines
 */

var TTFGlyphEncoder = function () {
  function TTFGlyphEncoder() {
    _classCallCheck(this, TTFGlyphEncoder);
  }

  _createClass(TTFGlyphEncoder, [{
    key: 'encodeSimple',
    value: function encodeSimple(path) {
      var instructions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

      var endPtsOfContours = [];
      var xPoints = [];
      var yPoints = [];
      var flags = [];
      var same = 0;
      var lastX = 0,
          lastY = 0,
          lastFlag = 0;
      var pointCount = 0;

      for (var i = 0; i < path.commands.length; i++) {
        var c = path.commands[i];

        for (var j = 0; j < c.args.length; j += 2) {
          var x = c.args[j];
          var y = c.args[j + 1];
          var flag = 0;

          // If the ending point of a quadratic curve is the midpoint
          // between the control point and the control point of the next
          // quadratic curve, we can omit the ending point.
          if (c.command === 'quadraticCurveTo' && j === 2) {
            var next = path.commands[i + 1];
            if (next && next.command === 'quadraticCurveTo') {
              var midX = (lastX + next.args[0]) / 2;
              var midY = (lastY + next.args[1]) / 2;

              if (x === midX && y === midY) {
                continue;
              }
            }
          }

          // All points except control points are on curve.
          if (!(c.command === 'quadraticCurveTo' && j === 0)) {
            flag |= ON_CURVE$1;
          }

          flag = this._encodePoint(x, lastX, xPoints, flag, X_SHORT_VECTOR$1, SAME_X$1);
          flag = this._encodePoint(y, lastY, yPoints, flag, Y_SHORT_VECTOR$1, SAME_Y$1);

          if (flag === lastFlag && same < 255) {
            flags[flags.length - 1] |= REPEAT$1;
            same++;
          } else {
            if (same > 0) {
              flags.push(same);
              same = 0;
            }

            flags.push(flag);
            lastFlag = flag;
          }

          lastX = x;
          lastY = y;
          pointCount++;
        }

        if (c.command === 'closePath') {
          endPtsOfContours.push(pointCount - 1);
        }
      }

      // Close the path if the last command didn't already
      if (path.commands.length > 1 && path.commands[path.commands.length - 1].command !== 'closePath') {
        endPtsOfContours.push(pointCount - 1);
      }

      var bbox = path.bbox;
      var glyf = {
        numberOfContours: endPtsOfContours.length,
        xMin: bbox.minX,
        yMin: bbox.minY,
        xMax: bbox.maxX,
        yMax: bbox.maxY,
        endPtsOfContours: endPtsOfContours,
        instructions: instructions,
        flags: flags,
        xPoints: xPoints,
        yPoints: yPoints
      };

      var size = Glyf.size(glyf);
      var tail = 4 - size % 4;

      var stream = new r.EncodeStream(size + tail);
      Glyf.encode(stream, glyf);

      // Align to 4-byte length
      if (tail !== 0) {
        stream.fill(0, tail);
      }

      return stream.buffer;
    }
  }, {
    key: '_encodePoint',
    value: function _encodePoint(value, last, points, flag, shortFlag, sameFlag) {
      var diff = value - last;

      if (value === last) {
        flag |= sameFlag;
      } else {
        if (-255 <= diff && diff <= 255) {
          flag |= shortFlag;
          if (diff < 0) {
            diff = -diff;
          } else {
            flag |= sameFlag;
          }
        }

        points.push(diff);
      }

      return flag;
    }
  }]);

  return TTFGlyphEncoder;
}();

var TTFSubset = function (_Subset) {
  _inherits(TTFSubset, _Subset);

  function TTFSubset(font) {
    _classCallCheck(this, TTFSubset);

    var _this = _possibleConstructorReturn(this, (TTFSubset.__proto__ || _Object$getPrototypeOf(TTFSubset)).call(this, font));

    _this.glyphEncoder = new TTFGlyphEncoder();
    return _this;
  }

  _createClass(TTFSubset, [{
    key: '_addGlyph',
    value: function _addGlyph(gid) {
      var glyph = this.font.getGlyph(gid);
      var glyf = glyph._decode();

      // get the offset to the glyph from the loca table
      var curOffset = this.font.loca.offsets[gid];
      var nextOffset = this.font.loca.offsets[gid + 1];

      var stream = this.font._getTableStream('glyf');
      stream.pos += curOffset;

      var buffer = stream.readBuffer(nextOffset - curOffset);

      // if it is a compound glyph, include its components
      if (glyf && glyf.numberOfContours < 0) {
        buffer = new Buffer(buffer);
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = _getIterator(glyf.components), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var component = _step.value;

            gid = this.includeGlyph(component.glyphID);
            buffer.writeUInt16BE(gid, component.pos);
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }
      } else if (glyf && this.font._variationProcessor) {
        // If this is a TrueType variation glyph, re-encode the path
        buffer = this.glyphEncoder.encodeSimple(glyph.path, glyf.instructions);
      }

      this.glyf.push(buffer);
      this.loca.offsets.push(this.offset);

      this.hmtx.metrics.push({
        advance: glyph.advanceWidth,
        bearing: glyph._getMetrics().leftBearing
      });

      this.offset += buffer.length;
      return this.glyf.length - 1;
    }
  }, {
    key: 'encode',
    value: function encode(stream) {
      // tables required by PDF spec:
      //   head, hhea, loca, maxp, cvt , prep, glyf, hmtx, fpgm
      //
      // additional tables required for standalone fonts:
      //   name, cmap, OS/2, post

      this.glyf = [];
      this.offset = 0;
      this.loca = {
        offsets: []
      };

      this.hmtx = {
        metrics: [],
        bearings: []
      };

      // include all the glyphs
      // not using a for loop because we need to support adding more
      // glyphs to the array as we go, and CoffeeScript caches the length.
      var i = 0;
      while (i < this.glyphs.length) {
        this._addGlyph(this.glyphs[i++]);
      }

      var maxp = cloneDeep(this.font.maxp);
      maxp.numGlyphs = this.glyf.length;

      this.loca.offsets.push(this.offset);
      tables.loca.preEncode.call(this.loca);

      var head = cloneDeep(this.font.head);
      head.indexToLocFormat = this.loca.version;

      var hhea = cloneDeep(this.font.hhea);
      hhea.numberOfMetrics = this.hmtx.metrics.length;

      // map = []
      // for index in [0...256]
      //     if index < @numGlyphs
      //         map[index] = index
      //     else
      //         map[index] = 0
      //
      // cmapTable =
      //     version: 0
      //     length: 262
      //     language: 0
      //     codeMap: map
      //
      // cmap =
      //     version: 0
      //     numSubtables: 1
      //     tables: [
      //         platformID: 1
      //         encodingID: 0
      //         table: cmapTable
      //     ]

      // TODO: subset prep, cvt, fpgm?
      Directory.encode(stream, {
        tables: {
          head: head,
          hhea: hhea,
          loca: this.loca,
          maxp: maxp,
          'cvt ': this.font['cvt '],
          prep: this.font.prep,
          glyf: this.glyf,
          hmtx: this.hmtx,
          fpgm: this.font.fpgm

          // name: clone @font.name
          // 'OS/2': clone @font['OS/2']
          // post: clone @font.post
          // cmap: cmap
        }
      });
    }
  }]);

  return TTFSubset;
}(Subset);

var CFFSubset = function (_Subset) {
  _inherits(CFFSubset, _Subset);

  function CFFSubset(font) {
    _classCallCheck(this, CFFSubset);

    var _this = _possibleConstructorReturn(this, (CFFSubset.__proto__ || _Object$getPrototypeOf(CFFSubset)).call(this, font));

    _this.cff = _this.font['CFF '];
    if (!_this.cff) {
      throw new Error('Not a CFF Font');
    }
    return _this;
  }

  _createClass(CFFSubset, [{
    key: 'subsetCharstrings',
    value: function subsetCharstrings() {
      this.charstrings = [];
      var gsubrs = {};

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(this.glyphs), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var gid = _step.value;

          this.charstrings.push(this.cff.getCharString(gid));

          var glyph = this.font.getGlyph(gid);
          var path = glyph.path; // this causes the glyph to be parsed

          for (var subr in glyph._usedGsubrs) {
            gsubrs[subr] = true;
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      this.gsubrs = this.subsetSubrs(this.cff.globalSubrIndex, gsubrs);
    }
  }, {
    key: 'subsetSubrs',
    value: function subsetSubrs(subrs, used) {
      var res = [];
      for (var i = 0; i < subrs.length; i++) {
        var subr = subrs[i];
        if (used[i]) {
          this.cff.stream.pos = subr.offset;
          res.push(this.cff.stream.readBuffer(subr.length));
        } else {
          res.push(new Buffer([11])); // return
        }
      }

      return res;
    }
  }, {
    key: 'subsetFontdict',
    value: function subsetFontdict(topDict) {
      topDict.FDArray = [];
      topDict.FDSelect = {
        version: 0,
        fds: []
      };

      var used_fds = {};
      var used_subrs = [];
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(this.glyphs), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var gid = _step2.value;

          var fd = this.cff.fdForGlyph(gid);
          if (fd == null) {
            continue;
          }

          if (!used_fds[fd]) {
            topDict.FDArray.push(_Object$assign({}, this.cff.topDict.FDArray[fd]));
            used_subrs.push({});
          }

          used_fds[fd] = true;
          topDict.FDSelect.fds.push(topDict.FDArray.length - 1);

          var glyph = this.font.getGlyph(gid);
          var path = glyph.path; // this causes the glyph to be parsed
          for (var subr in glyph._usedSubrs) {
            used_subrs[used_subrs.length - 1][subr] = true;
          }
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      for (var i = 0; i < topDict.FDArray.length; i++) {
        var dict = topDict.FDArray[i];
        delete dict.FontName;
        if (dict.Private && dict.Private.Subrs) {
          dict.Private = _Object$assign({}, dict.Private);
          dict.Private.Subrs = this.subsetSubrs(dict.Private.Subrs, used_subrs[i]);
        }
      }

      return;
    }
  }, {
    key: 'createCIDFontdict',
    value: function createCIDFontdict(topDict) {
      var used_subrs = {};
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = _getIterator(this.glyphs), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var gid = _step3.value;

          var glyph = this.font.getGlyph(gid);
          var path = glyph.path; // this causes the glyph to be parsed

          for (var subr in glyph._usedSubrs) {
            used_subrs[subr] = true;
          }
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3.return) {
            _iterator3.return();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }

      var privateDict = _Object$assign({}, this.cff.topDict.Private);
      privateDict.Subrs = this.subsetSubrs(this.cff.topDict.Private.Subrs, used_subrs);

      topDict.FDArray = [{ Private: privateDict }];
      return topDict.FDSelect = {
        version: 3,
        nRanges: 1,
        ranges: [{ first: 0, fd: 0 }],
        sentinel: this.charstrings.length
      };
    }
  }, {
    key: 'addString',
    value: function addString(string) {
      if (!string) {
        return null;
      }

      if (!this.strings) {
        this.strings = [];
      }

      this.strings.push(string);
      return standardStrings.length + this.strings.length - 1;
    }
  }, {
    key: 'encode',
    value: function encode(stream) {
      this.subsetCharstrings();

      var charset = {
        version: this.charstrings.length > 255 ? 2 : 1,
        ranges: [{ first: 1, nLeft: this.charstrings.length - 2 }]
      };

      var topDict = _Object$assign({}, this.cff.topDict);
      topDict.Private = null;
      topDict.charset = charset;
      topDict.Encoding = null;
      topDict.CharStrings = this.charstrings;

      var _arr = ['version', 'Notice', 'Copyright', 'FullName', 'FamilyName', 'Weight', 'PostScript', 'BaseFontName', 'FontName'];
      for (var _i = 0; _i < _arr.length; _i++) {
        var key = _arr[_i];
        topDict[key] = this.addString(this.cff.string(topDict[key]));
      }

      topDict.ROS = [this.addString('Adobe'), this.addString('Identity'), 0];
      topDict.CIDCount = this.charstrings.length;

      if (this.cff.isCIDFont) {
        this.subsetFontdict(topDict);
      } else {
        this.createCIDFontdict(topDict);
      }

      var top = {
        header: this.cff.header,
        nameIndex: [this.cff.postscriptName],
        topDictIndex: [topDict],
        stringIndex: this.strings,
        globalSubrIndex: this.gsubrs
      };

      CFFTop.encode(stream, top);
    }
  }]);

  return CFFSubset;
}(Subset);

var _class;
function _applyDecoratedDescriptor(target, property, decorators, descriptor, context) {
  var desc = {};
  Object['ke' + 'ys'](descriptor).forEach(function (key) {
    desc[key] = descriptor[key];
  });
  desc.enumerable = !!desc.enumerable;
  desc.configurable = !!desc.configurable;

  if ('value' in desc || desc.initializer) {
    desc.writable = true;
  }

  desc = decorators.slice().reverse().reduce(function (desc, decorator) {
    return decorator(target, property, desc) || desc;
  }, desc);

  if (context && desc.initializer !== void 0) {
    desc.value = desc.initializer ? desc.initializer.call(context) : void 0;
    desc.initializer = undefined;
  }

  if (desc.initializer === void 0) {
    Object['define' + 'Property'](target, property, desc);
    desc = null;
  }

  return desc;
}

/**
 * This is the base class for all SFNT-based font formats in fontkit.
 * It supports TrueType, and PostScript glyphs, and several color glyph formats.
 */
var TTFFont = (_class = function () {
  _createClass(TTFFont, null, [{
    key: 'probe',
    value: function probe(buffer) {
      var format = buffer.toString('ascii', 0, 4);
      return format === 'true' || format === 'OTTO' || format === String.fromCharCode(0, 1, 0, 0);
    }
  }]);

  function TTFFont(stream) {
    var variationCoords = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    _classCallCheck(this, TTFFont);

    this.stream = stream;
    this._directoryPos = this.stream.pos;
    this._tables = {};
    this._glyphs = {};
    this._decodeDirectory();

    // define properties for each table to lazily parse
    for (var tag in this.directory.tables) {
      var table = this.directory.tables[tag];
      if (tables[tag] && table.length > 0) {
        _Object$defineProperty(this, tag, {
          get: this._getTable.bind(this, table)
        });
      }
    }

    if (variationCoords) {
      this._variationProcessor = new GlyphVariationProcessor(this, variationCoords);
    }
  }

  _createClass(TTFFont, [{
    key: '_getTable',
    value: function _getTable(table) {
      if (!(table.tag in this._tables)) {
        try {
          this._tables[table.tag] = this._decodeTable(table);
        } catch (e) {
          if (fontkit.logErrors) {
            console.error('Error decoding table ' + table.tag);
            console.error(e.stack);
          }
        }
      }

      return this._tables[table.tag];
    }
  }, {
    key: '_getTableStream',
    value: function _getTableStream(tag) {
      var table = this.directory.tables[tag];
      if (table) {
        this.stream.pos = table.offset;
        return this.stream;
      }

      return null;
    }
  }, {
    key: '_decodeDirectory',
    value: function _decodeDirectory() {
      return this.directory = Directory.decode(this.stream, { _startOffset: 0 });
    }
  }, {
    key: '_decodeTable',
    value: function _decodeTable(table) {
      var pos = this.stream.pos;

      var stream = this._getTableStream(table.tag);
      var result = tables[table.tag].decode(stream, this, table.length);

      this.stream.pos = pos;
      return result;
    }

    /**
     * The unique PostScript name for this font
     * @type {string}
     */

  }, {
    key: 'getName',


    /**
     * Gets a string from the font's `name` table
     * `lang` is a BCP-47 language code.
     * @return {string}
     */
    value: function getName(key) {
      var lang = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'en';

      var record = this.name.records[key];
      if (record) {
        return record[lang];
      }

      return null;
    }

    /**
     * The font's full name, e.g. "Helvetica Bold"
     * @type {string}
     */

  }, {
    key: 'hasGlyphForCodePoint',


    /**
     * Returns whether there is glyph in the font for the given unicode code point.
     *
     * @param {number} codePoint
     * @return {boolean}
     */
    value: function hasGlyphForCodePoint(codePoint) {
      return !!this._cmapProcessor.lookup(codePoint);
    }

    /**
     * Maps a single unicode code point to a Glyph object.
     * Does not perform any advanced substitutions (there is no context to do so).
     *
     * @param {number} codePoint
     * @return {Glyph}
     */

  }, {
    key: 'glyphForCodePoint',
    value: function glyphForCodePoint(codePoint) {
      return this.getGlyph(this._cmapProcessor.lookup(codePoint), [codePoint]);
    }

    /**
     * Returns an array of Glyph objects for the given string.
     * This is only a one-to-one mapping from characters to glyphs.
     * For most uses, you should use font.layout (described below), which
     * provides a much more advanced mapping supporting AAT and OpenType shaping.
     *
     * @param {string} string
     * @return {Glyph[]}
     */

  }, {
    key: 'glyphsForString',
    value: function glyphsForString(string) {
      var glyphs = [];
      var len = string.length;
      var idx = 0;
      var last = -1;
      var state = -1;

      while (idx <= len) {
        var code = 0;
        var nextState = 0;

        if (idx < len) {
          // Decode the next codepoint from UTF 16
          code = string.charCodeAt(idx++);
          if (0xd800 <= code && code <= 0xdbff && idx < len) {
            var next = string.charCodeAt(idx);
            if (0xdc00 <= next && next <= 0xdfff) {
              idx++;
              code = ((code & 0x3ff) << 10) + (next & 0x3ff) + 0x10000;
            }
          }

          // Compute the next state: 1 if the next codepoint is a variation selector, 0 otherwise.
          nextState = 0xfe00 <= code && code <= 0xfe0f || 0xe0100 <= code && code <= 0xe01ef ? 1 : 0;
        } else {
          idx++;
        }

        if (state === 0 && nextState === 1) {
          // Variation selector following normal codepoint.
          glyphs.push(this.getGlyph(this._cmapProcessor.lookup(last, code), [last, code]));
        } else if (state === 0 && nextState === 0) {
          // Normal codepoint following normal codepoint.
          glyphs.push(this.glyphForCodePoint(last));
        }

        last = code;
        state = nextState;
      }

      return glyphs;
    }
  }, {
    key: 'layout',


    /**
     * Returns a GlyphRun object, which includes an array of Glyphs and GlyphPositions for the given string.
     *
     * @param {string} string
     * @param {string[]} [userFeatures]
     * @param {string} [script]
     * @param {string} [language]
     * @return {GlyphRun}
     */
    value: function layout(string, userFeatures, script, language) {
      return this._layoutEngine.layout(string, userFeatures, script, language);
    }

    /**
     * Returns an array of strings that map to the given glyph id.
     * @param {number} gid - glyph id
     */

  }, {
    key: 'stringsForGlyph',
    value: function stringsForGlyph(gid) {
      return this._layoutEngine.stringsForGlyph(gid);
    }

    /**
     * An array of all [OpenType feature tags](https://www.microsoft.com/typography/otspec/featuretags.htm)
     * (or mapped AAT tags) supported by the font.
     * The features parameter is an array of OpenType feature tags to be applied in addition to the default set.
     * If this is an AAT font, the OpenType feature tags are mapped to AAT features.
     *
     * @type {string[]}
     */

  }, {
    key: '_getBaseGlyph',
    value: function _getBaseGlyph(glyph) {
      var characters = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

      if (!this._glyphs[glyph]) {
        if (this.directory.tables.glyf) {
          this._glyphs[glyph] = new TTFGlyph(glyph, characters, this);
        } else if (this.directory.tables['CFF ']) {
          this._glyphs[glyph] = new CFFGlyph(glyph, characters, this);
        }
      }

      return this._glyphs[glyph] || null;
    }

    /**
     * Returns a glyph object for the given glyph id.
     * You can pass the array of code points this glyph represents for
     * your use later, and it will be stored in the glyph object.
     *
     * @param {number} glyph
     * @param {number[]} characters
     * @return {Glyph}
     */

  }, {
    key: 'getGlyph',
    value: function getGlyph(glyph) {
      var characters = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

      if (!this._glyphs[glyph]) {
        if (this.directory.tables.sbix) {
          this._glyphs[glyph] = new SBIXGlyph(glyph, characters, this);
        } else if (this.directory.tables.COLR && this.directory.tables.CPAL) {
          this._glyphs[glyph] = new COLRGlyph(glyph, characters, this);
        } else {
          this._getBaseGlyph(glyph, characters);
        }
      }

      return this._glyphs[glyph] || null;
    }

    /**
     * Returns a Subset for this font.
     * @return {Subset}
     */

  }, {
    key: 'createSubset',
    value: function createSubset() {
      if (this.directory.tables['CFF ']) {
        return new CFFSubset(this);
      }

      return new TTFSubset(this);
    }

    /**
     * Returns an object describing the available variation axes
     * that this font supports. Keys are setting tags, and values
     * contain the axis name, range, and default value.
     *
     * @type {object}
     */

  }, {
    key: 'getVariation',


    /**
     * Returns a new font with the given variation settings applied.
     * Settings can either be an instance name, or an object containing
     * variation tags as specified by the `variationAxes` property.
     *
     * @param {object} settings
     * @return {TTFFont}
     */
    value: function getVariation(settings) {
      if (!this.directory.tables.fvar || !this.directory.tables.gvar || !this.directory.tables.glyf) {
        throw new Error('Variations require a font with the fvar, gvar, and glyf tables.');
      }

      if (typeof settings === 'string') {
        settings = this.namedVariations[settings];
      }

      if ((typeof settings === 'undefined' ? 'undefined' : _typeof(settings)) !== 'object') {
        throw new Error('Variation settings must be either a variation name or settings object.');
      }

      // normalize the coordinates
      var coords = this.fvar.axis.map(function (axis, i) {
        var axisTag = axis.axisTag.trim();
        if (axisTag in settings) {
          return Math.max(axis.minValue, Math.min(axis.maxValue, settings[axisTag]));
        } else {
          return axis.defaultValue;
        }
      });

      var stream = new r.DecodeStream(this.stream.buffer);
      stream.pos = this._directoryPos;

      var font = new TTFFont(stream, coords);
      font._tables = this._tables;

      return font;
    }

    // Standardized format plugin API

  }, {
    key: 'getFont',
    value: function getFont(name) {
      return this.getVariation(name);
    }
  }, {
    key: 'postscriptName',
    get: function get() {
      var name = this.name.records.postscriptName;
      var lang = _Object$keys(name)[0];
      return name[lang];
    }
  }, {
    key: 'fullName',
    get: function get() {
      return this.getName('fullName');
    }

    /**
     * The font's family name, e.g. "Helvetica"
     * @type {string}
     */

  }, {
    key: 'familyName',
    get: function get() {
      return this.getName('fontFamily');
    }

    /**
     * The font's sub-family, e.g. "Bold".
     * @type {string}
     */

  }, {
    key: 'subfamilyName',
    get: function get() {
      return this.getName('fontSubfamily');
    }

    /**
     * The font's copyright information
     * @type {string}
     */

  }, {
    key: 'copyright',
    get: function get() {
      return this.getName('copyright');
    }

    /**
     * The font's version number
     * @type {string}
     */

  }, {
    key: 'version',
    get: function get() {
      return this.getName('version');
    }

    /**
     * The font’s [ascender](https://en.wikipedia.org/wiki/Ascender_(typography))
     * @type {number}
     */

  }, {
    key: 'ascent',
    get: function get() {
      return this.hhea.ascent;
    }

    /**
     * The font’s [descender](https://en.wikipedia.org/wiki/Descender)
     * @type {number}
     */

  }, {
    key: 'descent',
    get: function get() {
      return this.hhea.descent;
    }

    /**
     * The amount of space that should be included between lines
     * @type {number}
     */

  }, {
    key: 'lineGap',
    get: function get() {
      return this.hhea.lineGap;
    }

    /**
     * The offset from the normal underline position that should be used
     * @type {number}
     */

  }, {
    key: 'underlinePosition',
    get: function get() {
      return this.post.underlinePosition;
    }

    /**
     * The weight of the underline that should be used
     * @type {number}
     */

  }, {
    key: 'underlineThickness',
    get: function get() {
      return this.post.underlineThickness;
    }

    /**
     * If this is an italic font, the angle the cursor should be drawn at to match the font design
     * @type {number}
     */

  }, {
    key: 'italicAngle',
    get: function get() {
      return this.post.italicAngle;
    }

    /**
     * The height of capital letters above the baseline.
     * See [here](https://en.wikipedia.org/wiki/Cap_height) for more details.
     * @type {number}
     */

  }, {
    key: 'capHeight',
    get: function get() {
      var os2 = this['OS/2'];
      return os2 ? os2.capHeight : this.ascent;
    }

    /**
     * The height of lower case letters in the font.
     * See [here](https://en.wikipedia.org/wiki/X-height) for more details.
     * @type {number}
     */

  }, {
    key: 'xHeight',
    get: function get() {
      var os2 = this['OS/2'];
      return os2 ? os2.xHeight : 0;
    }

    /**
     * The number of glyphs in the font.
     * @type {number}
     */

  }, {
    key: 'numGlyphs',
    get: function get() {
      return this.maxp.numGlyphs;
    }

    /**
     * The size of the font’s internal coordinate grid
     * @type {number}
     */

  }, {
    key: 'unitsPerEm',
    get: function get() {
      return this.head.unitsPerEm;
    }

    /**
     * The font’s bounding box, i.e. the box that encloses all glyphs in the font.
     * @type {BBox}
     */

  }, {
    key: 'bbox',
    get: function get() {
      return _Object$freeze(new BBox(this.head.xMin, this.head.yMin, this.head.xMax, this.head.yMax));
    }
  }, {
    key: '_cmapProcessor',
    get: function get() {
      return new CmapProcessor(this.cmap);
    }

    /**
     * An array of all of the unicode code points supported by the font.
     * @type {number[]}
     */

  }, {
    key: 'characterSet',
    get: function get() {
      return this._cmapProcessor.getCharacterSet();
    }
  }, {
    key: '_layoutEngine',
    get: function get() {
      return new LayoutEngine(this);
    }
  }, {
    key: 'availableFeatures',
    get: function get() {
      return this._layoutEngine.getAvailableFeatures();
    }
  }, {
    key: 'variationAxes',
    get: function get() {
      var res = {};
      if (!this.fvar) {
        return res;
      }

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(this.fvar.axis), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var axis = _step.value;

          res[axis.axisTag.trim()] = {
            name: axis.name.en,
            min: axis.minValue,
            default: axis.defaultValue,
            max: axis.maxValue
          };
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return res;
    }

    /**
     * Returns an object describing the named variation instances
     * that the font designer has specified. Keys are variation names
     * and values are the variation settings for this instance.
     *
     * @type {object}
     */

  }, {
    key: 'namedVariations',
    get: function get() {
      var res = {};
      if (!this.fvar) {
        return res;
      }

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(this.fvar.instance), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var instance = _step2.value;

          var settings = {};
          for (var i = 0; i < this.fvar.axis.length; i++) {
            var axis = this.fvar.axis[i];
            settings[axis.axisTag.trim()] = instance.coord[i];
          }

          res[instance.name.en] = settings;
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      return res;
    }
  }]);

  return TTFFont;
}(), (_applyDecoratedDescriptor(_class.prototype, 'bbox', [cache], _Object$getOwnPropertyDescriptor(_class.prototype, 'bbox'), _class.prototype), _applyDecoratedDescriptor(_class.prototype, '_cmapProcessor', [cache], _Object$getOwnPropertyDescriptor(_class.prototype, '_cmapProcessor'), _class.prototype), _applyDecoratedDescriptor(_class.prototype, 'characterSet', [cache], _Object$getOwnPropertyDescriptor(_class.prototype, 'characterSet'), _class.prototype), _applyDecoratedDescriptor(_class.prototype, '_layoutEngine', [cache], _Object$getOwnPropertyDescriptor(_class.prototype, '_layoutEngine'), _class.prototype)), _class);

var WOFFDirectoryEntry = new r.Struct({
  tag: new r.String(4),
  offset: new r.Pointer(r.uint32, 'void', { type: 'global' }),
  compLength: r.uint32,
  length: r.uint32,
  origChecksum: r.uint32
});

var WOFFDirectory = new r.Struct({
  tag: new r.String(4), // should be 'wOFF'
  flavor: r.uint32,
  length: r.uint32,
  numTables: r.uint16,
  reserved: new r.Reserved(r.uint16),
  totalSfntSize: r.uint32,
  majorVersion: r.uint16,
  minorVersion: r.uint16,
  metaOffset: r.uint32,
  metaLength: r.uint32,
  metaOrigLength: r.uint32,
  privOffset: r.uint32,
  privLength: r.uint32,
  tables: new r.Array(WOFFDirectoryEntry, 'numTables')
});

WOFFDirectory.process = function () {
  var tables = {};
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = _getIterator(this.tables), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var table = _step.value;

      tables[table.tag] = table;
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  this.tables = tables;
};

var WOFFFont = function (_TTFFont) {
  _inherits(WOFFFont, _TTFFont);

  function WOFFFont() {
    _classCallCheck(this, WOFFFont);

    return _possibleConstructorReturn(this, (WOFFFont.__proto__ || _Object$getPrototypeOf(WOFFFont)).apply(this, arguments));
  }

  _createClass(WOFFFont, [{
    key: '_decodeDirectory',
    value: function _decodeDirectory() {
      this.directory = WOFFDirectory.decode(this.stream, { _startOffset: 0 });
    }
  }, {
    key: '_getTableStream',
    value: function _getTableStream(tag) {
      var table = this.directory.tables[tag];
      if (table) {
        this.stream.pos = table.offset;

        if (table.compLength < table.length) {
          this.stream.pos += 2; // skip deflate header
          var outBuffer = new Buffer(table.length);
          var buf = inflate(this.stream.readBuffer(table.compLength - 2), outBuffer);
          return new r.DecodeStream(buf);
        } else {
          return this.stream;
        }
      }

      return null;
    }
  }], [{
    key: 'probe',
    value: function probe(buffer) {
      return buffer.toString('ascii', 0, 4) === 'wOFF';
    }
  }]);

  return WOFFFont;
}(TTFFont);

/**
 * Represents a TrueType glyph in the WOFF2 format, which compresses glyphs differently.
 */

var WOFF2Glyph = function (_TTFGlyph) {
  _inherits(WOFF2Glyph, _TTFGlyph);

  function WOFF2Glyph() {
    _classCallCheck(this, WOFF2Glyph);

    return _possibleConstructorReturn(this, (WOFF2Glyph.__proto__ || _Object$getPrototypeOf(WOFF2Glyph)).apply(this, arguments));
  }

  _createClass(WOFF2Glyph, [{
    key: '_decode',
    value: function _decode() {
      // We have to decode in advance (in WOFF2Font), so just return the pre-decoded data.
      return this._font._transformedGlyphs[this.id];
    }
  }, {
    key: '_getCBox',
    value: function _getCBox() {
      return this.path.bbox;
    }
  }]);

  return WOFF2Glyph;
}(TTFGlyph);

var Base128 = {
  decode: function decode(stream) {
    var result = 0;
    var iterable = [0, 1, 2, 3, 4];
    for (var j = 0; j < iterable.length; j++) {
      var i = iterable[j];
      var code = stream.readUInt8();

      // If any of the top seven bits are set then we're about to overflow.
      if (result & 0xe0000000) {
        throw new Error('Overflow');
      }

      result = result << 7 | code & 0x7f;
      if ((code & 0x80) === 0) {
        return result;
      }
    }

    throw new Error('Bad base 128 number');
  }
};

var knownTags = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

var WOFF2DirectoryEntry = new r.Struct({
  flags: r.uint8,
  customTag: new r.Optional(new r.String(4), function (t) {
    return (t.flags & 0x3f) === 0x3f;
  }),
  tag: function tag(t) {
    return t.customTag || knownTags[t.flags & 0x3f];
  }, // || (() => { throw new Error(`Bad tag: ${flags & 0x3f}`); })(); },
  length: Base128,
  transformVersion: function transformVersion(t) {
    return t.flags >>> 6 & 0x03;
  },
  transformed: function transformed(t) {
    return t.tag === 'glyf' || t.tag === 'loca' ? t.transformVersion === 0 : t.transformVersion !== 0;
  },
  transformLength: new r.Optional(Base128, function (t) {
    return t.transformed;
  })
});

var WOFF2Directory = new r.Struct({
  tag: new r.String(4), // should be 'wOF2'
  flavor: r.uint32,
  length: r.uint32,
  numTables: r.uint16,
  reserved: new r.Reserved(r.uint16),
  totalSfntSize: r.uint32,
  totalCompressedSize: r.uint32,
  majorVersion: r.uint16,
  minorVersion: r.uint16,
  metaOffset: r.uint32,
  metaLength: r.uint32,
  metaOrigLength: r.uint32,
  privOffset: r.uint32,
  privLength: r.uint32,
  tables: new r.Array(WOFF2DirectoryEntry, 'numTables')
});

WOFF2Directory.process = function () {
  var tables = {};
  for (var i = 0; i < this.tables.length; i++) {
    var table = this.tables[i];
    tables[table.tag] = table;
  }

  return this.tables = tables;
};

/**
 * Subclass of TTFFont that represents a TTF/OTF font compressed by WOFF2
 * See spec here: http://www.w3.org/TR/WOFF2/
 */

var WOFF2Font = function (_TTFFont) {
  _inherits(WOFF2Font, _TTFFont);

  function WOFF2Font() {
    _classCallCheck(this, WOFF2Font);

    return _possibleConstructorReturn(this, (WOFF2Font.__proto__ || _Object$getPrototypeOf(WOFF2Font)).apply(this, arguments));
  }

  _createClass(WOFF2Font, [{
    key: '_decodeDirectory',
    value: function _decodeDirectory() {
      this.directory = WOFF2Directory.decode(this.stream);
      this._dataPos = this.stream.pos;
    }
  }, {
    key: '_decompress',
    value: function _decompress() {
      // decompress data and setup table offsets if we haven't already
      if (!this._decompressed) {
        this.stream.pos = this._dataPos;
        var buffer = this.stream.readBuffer(this.directory.totalCompressedSize);

        var decompressedSize = 0;
        for (var tag in this.directory.tables) {
          var entry = this.directory.tables[tag];
          entry.offset = decompressedSize;
          decompressedSize += entry.transformLength != null ? entry.transformLength : entry.length;
        }

        var decompressed = brotli(buffer, decompressedSize);
        if (!decompressed) {
          throw new Error('Error decoding compressed data in WOFF2');
        }

        this.stream = new r.DecodeStream(new Buffer(decompressed));
        this._decompressed = true;
      }
    }
  }, {
    key: '_decodeTable',
    value: function _decodeTable(table) {
      this._decompress();
      return _get(WOFF2Font.prototype.__proto__ || _Object$getPrototypeOf(WOFF2Font.prototype), '_decodeTable', this).call(this, table);
    }

    // Override this method to get a glyph and return our
    // custom subclass if there is a glyf table.

  }, {
    key: '_getBaseGlyph',
    value: function _getBaseGlyph(glyph) {
      var characters = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

      if (!this._glyphs[glyph]) {
        if (this.directory.tables.glyf && this.directory.tables.glyf.transformed) {
          if (!this._transformedGlyphs) {
            this._transformGlyfTable();
          }
          return this._glyphs[glyph] = new WOFF2Glyph(glyph, characters, this);
        } else {
          return _get(WOFF2Font.prototype.__proto__ || _Object$getPrototypeOf(WOFF2Font.prototype), '_getBaseGlyph', this).call(this, glyph, characters);
        }
      }
    }
  }, {
    key: '_transformGlyfTable',
    value: function _transformGlyfTable() {
      this._decompress();
      this.stream.pos = this.directory.tables.glyf.offset;
      var table = GlyfTable.decode(this.stream);
      var glyphs = [];

      for (var index = 0; index < table.numGlyphs; index++) {
        var glyph = {};
        var nContours = table.nContours.readInt16BE();
        glyph.numberOfContours = nContours;

        if (nContours > 0) {
          // simple glyph
          var nPoints = [];
          var totalPoints = 0;

          for (var i = 0; i < nContours; i++) {
            var _r = read255UInt16(table.nPoints);
            nPoints.push(_r);
            totalPoints += _r;
          }

          glyph.points = decodeTriplet(table.flags, table.glyphs, totalPoints);
          for (var _i = 0; _i < nContours; _i++) {
            glyph.points[nPoints[_i] - 1].endContour = true;
          }

          var instructionSize = read255UInt16(table.glyphs);
        } else if (nContours < 0) {
          // composite glyph
          var haveInstructions = TTFGlyph.prototype._decodeComposite.call({ _font: this }, glyph, table.composites);
          if (haveInstructions) {
            var instructionSize = read255UInt16(table.glyphs);
          }
        }

        glyphs.push(glyph);
      }

      this._transformedGlyphs = glyphs;
    }
  }], [{
    key: 'probe',
    value: function probe(buffer) {
      return buffer.toString('ascii', 0, 4) === 'wOF2';
    }
  }]);

  return WOFF2Font;
}(TTFFont);

var Substream = function () {
  function Substream(length) {
    _classCallCheck(this, Substream);

    this.length = length;
    this._buf = new r.Buffer(length);
  }

  _createClass(Substream, [{
    key: 'decode',
    value: function decode(stream, parent) {
      return new r.DecodeStream(this._buf.decode(stream, parent));
    }
  }]);

  return Substream;
}();

// This struct represents the entire glyf table


var GlyfTable = new r.Struct({
  version: r.uint32,
  numGlyphs: r.uint16,
  indexFormat: r.uint16,
  nContourStreamSize: r.uint32,
  nPointsStreamSize: r.uint32,
  flagStreamSize: r.uint32,
  glyphStreamSize: r.uint32,
  compositeStreamSize: r.uint32,
  bboxStreamSize: r.uint32,
  instructionStreamSize: r.uint32,
  nContours: new Substream('nContourStreamSize'),
  nPoints: new Substream('nPointsStreamSize'),
  flags: new Substream('flagStreamSize'),
  glyphs: new Substream('glyphStreamSize'),
  composites: new Substream('compositeStreamSize'),
  bboxes: new Substream('bboxStreamSize'),
  instructions: new Substream('instructionStreamSize')
});

var WORD_CODE = 253;
var ONE_MORE_BYTE_CODE2 = 254;
var ONE_MORE_BYTE_CODE1 = 255;
var LOWEST_U_CODE = 253;

function read255UInt16(stream) {
  var code = stream.readUInt8();

  if (code === WORD_CODE) {
    return stream.readUInt16BE();
  }

  if (code === ONE_MORE_BYTE_CODE1) {
    return stream.readUInt8() + LOWEST_U_CODE;
  }

  if (code === ONE_MORE_BYTE_CODE2) {
    return stream.readUInt8() + LOWEST_U_CODE * 2;
  }

  return code;
}

function withSign(flag, baseval) {
  return flag & 1 ? baseval : -baseval;
}

function decodeTriplet(flags, glyphs, nPoints) {
  var y = void 0;
  var x = y = 0;
  var res = [];

  for (var i = 0; i < nPoints; i++) {
    var dx = 0,
        dy = 0;
    var flag = flags.readUInt8();
    var onCurve = !(flag >> 7);
    flag &= 0x7f;

    if (flag < 10) {
      dx = 0;
      dy = withSign(flag, ((flag & 14) << 7) + glyphs.readUInt8());
    } else if (flag < 20) {
      dx = withSign(flag, ((flag - 10 & 14) << 7) + glyphs.readUInt8());
      dy = 0;
    } else if (flag < 84) {
      var b0 = flag - 20;
      var b1 = glyphs.readUInt8();
      dx = withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4));
      dy = withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f));
    } else if (flag < 120) {
      var b0 = flag - 84;
      dx = withSign(flag, 1 + (b0 / 12 << 8) + glyphs.readUInt8());
      dy = withSign(flag >> 1, 1 + (b0 % 12 >> 2 << 8) + glyphs.readUInt8());
    } else if (flag < 124) {
      var b1 = glyphs.readUInt8();
      var b2 = glyphs.readUInt8();
      dx = withSign(flag, (b1 << 4) + (b2 >> 4));
      dy = withSign(flag >> 1, ((b2 & 0x0f) << 8) + glyphs.readUInt8());
    } else {
      dx = withSign(flag, glyphs.readUInt16BE());
      dy = withSign(flag >> 1, glyphs.readUInt16BE());
    }

    x += dx;
    y += dy;
    res.push(new Point(onCurve, false, x, y));
  }

  return res;
}

var TTCHeader = new r.VersionedStruct(r.uint32, {
  0x00010000: {
    numFonts: r.uint32,
    offsets: new r.Array(r.uint32, 'numFonts')
  },
  0x00020000: {
    numFonts: r.uint32,
    offsets: new r.Array(r.uint32, 'numFonts'),
    dsigTag: r.uint32,
    dsigLength: r.uint32,
    dsigOffset: r.uint32
  }
});

var TrueTypeCollection = function () {
  _createClass(TrueTypeCollection, null, [{
    key: 'probe',
    value: function probe(buffer) {
      return buffer.toString('ascii', 0, 4) === 'ttcf';
    }
  }]);

  function TrueTypeCollection(stream) {
    _classCallCheck(this, TrueTypeCollection);

    this.stream = stream;
    if (stream.readString(4) !== 'ttcf') {
      throw new Error('Not a TrueType collection');
    }

    this.header = TTCHeader.decode(stream);
  }

  _createClass(TrueTypeCollection, [{
    key: 'getFont',
    value: function getFont(name) {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(this.header.offsets), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var offset = _step.value;

          var stream = new r.DecodeStream(this.stream.buffer);
          stream.pos = offset;
          var font = new TTFFont(stream);
          if (font.postscriptName === name) {
            return font;
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return null;
    }
  }, {
    key: 'fonts',
    get: function get() {
      var fonts = [];
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(this.header.offsets), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var offset = _step2.value;

          var stream = new r.DecodeStream(this.stream.buffer);
          stream.pos = offset;
          fonts.push(new TTFFont(stream));
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      return fonts;
    }
  }]);

  return TrueTypeCollection;
}();

var DFontName = new r.String(r.uint8);
var DFontData = new r.Struct({
  len: r.uint32,
  buf: new r.Buffer('len')
});

var Ref = new r.Struct({
  id: r.uint16,
  nameOffset: r.int16,
  attr: r.uint8,
  dataOffset: r.uint24,
  handle: r.uint32
});

var Type = new r.Struct({
  name: new r.String(4),
  maxTypeIndex: r.uint16,
  refList: new r.Pointer(r.uint16, new r.Array(Ref, function (t) {
    return t.maxTypeIndex + 1;
  }), { type: 'parent' })
});

var TypeList = new r.Struct({
  length: r.uint16,
  types: new r.Array(Type, function (t) {
    return t.length + 1;
  })
});

var DFontMap = new r.Struct({
  reserved: new r.Reserved(r.uint8, 24),
  typeList: new r.Pointer(r.uint16, TypeList),
  nameListOffset: new r.Pointer(r.uint16, 'void')
});

var DFontHeader = new r.Struct({
  dataOffset: r.uint32,
  map: new r.Pointer(r.uint32, DFontMap),
  dataLength: r.uint32,
  mapLength: r.uint32
});

var DFont = function () {
  _createClass(DFont, null, [{
    key: 'probe',
    value: function probe(buffer) {
      var stream = new r.DecodeStream(buffer);

      try {
        var header = DFontHeader.decode(stream);
      } catch (e) {
        return false;
      }

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(header.map.typeList.types), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var type = _step.value;

          if (type.name === 'sfnt') {
            return true;
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return false;
    }
  }]);

  function DFont(stream) {
    _classCallCheck(this, DFont);

    this.stream = stream;
    this.header = DFontHeader.decode(this.stream);

    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = _getIterator(this.header.map.typeList.types), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var type = _step2.value;
        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = _getIterator(type.refList), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            var ref = _step3.value;

            if (ref.nameOffset >= 0) {
              this.stream.pos = ref.nameOffset + this.header.map.nameListOffset;
              ref.name = DFontName.decode(this.stream);
            } else {
              ref.name = null;
            }
          }
        } catch (err) {
          _didIteratorError3 = true;
          _iteratorError3 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion3 && _iterator3.return) {
              _iterator3.return();
            }
          } finally {
            if (_didIteratorError3) {
              throw _iteratorError3;
            }
          }
        }

        if (type.name === 'sfnt') {
          this.sfnt = type;
        }
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2.return) {
          _iterator2.return();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }
  }

  _createClass(DFont, [{
    key: 'getFont',
    value: function getFont(name) {
      if (!this.sfnt) {
        return null;
      }

      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = _getIterator(this.sfnt.refList), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var ref = _step4.value;

          var pos = this.header.dataOffset + ref.dataOffset + 4;
          var stream = new r.DecodeStream(this.stream.buffer.slice(pos));
          var font = new TTFFont(stream);
          if (font.postscriptName === name) {
            return font;
          }
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4.return) {
            _iterator4.return();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }

      return null;
    }
  }, {
    key: 'fonts',
    get: function get() {
      var fonts = [];
      var _iteratorNormalCompletion5 = true;
      var _didIteratorError5 = false;
      var _iteratorError5 = undefined;

      try {
        for (var _iterator5 = _getIterator(this.sfnt.refList), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
          var ref = _step5.value;

          var pos = this.header.dataOffset + ref.dataOffset + 4;
          var stream = new r.DecodeStream(this.stream.buffer.slice(pos));
          fonts.push(new TTFFont(stream));
        }
      } catch (err) {
        _didIteratorError5 = true;
        _iteratorError5 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion5 && _iterator5.return) {
            _iterator5.return();
          }
        } finally {
          if (_didIteratorError5) {
            throw _iteratorError5;
          }
        }
      }

      return fonts;
    }
  }]);

  return DFont;
}();

// Register font formats
fontkit.registerFormat(TTFFont);
fontkit.registerFormat(WOFFFont);
fontkit.registerFormat(WOFF2Font);
fontkit.registerFormat(TrueTypeCollection);
fontkit.registerFormat(DFont);

module.exports = fontkit;
//# sourceMappingURL=index.js.map