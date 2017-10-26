CapHeightAlignmentTool = function() {
    "use strict";
    var measurementLineLockedClass = "cap-height-measurement__line--locked",
        topMeasurementLineListClass = "cap-height-measurement__lines--top",
        bottomMeasurementLineListClass = "cap-height-measurement__lines--bottom",
        fineTuneAdjustmentClass = "measurement-fine-tune",
        typefaceVariantMapping = {};

    function syncLineHeight() {
        $(".code-line-height").text($("#line-height").val());
        setSampleTextStyles();
        updateInlineStyles();
    }

    function syncFontSize() {
        $(".code-size").text($("#size").val());
        setSampleTextStyles();
        updateInlineStyles();
    }

    function syncTopMeasurement() {
        $(".code-top-measurement").text($("#top-measurement").val());
        updateInlineStyles();
    }

    function syncBottomMeasurement() {
        $(".code-bottom-measurement").text($("#bottom-measurement").val());
        updateInlineStyles();
    }

    function updateInlineStyles() {
        if ($("style#cap-aligned-line-height-inline-styles").length === 0) {
            $("head").append("<style id='cap-aligned-line-height-inline-styles'>");
        }

        var fontSize = parseInt($("#size").val(), 10),
            lineHeight = parseFloat($("#line-height").val(), 10),
            measuredLineHeight = lineHeight,
            topMeasurement = parseInt($("#top-measurement").val(), 10),
            bottomMeasurement = parseInt($("#bottom-measurement").val(), 10),
            topOffsetEm = Math.max((topMeasurement + (lineHeight - measuredLineHeight) * (fontSize / 2)), 0) / fontSize,
            bottomOffsetEm = Math.max((bottomMeasurement + (lineHeight - measuredLineHeight) * (fontSize / 2)), 0) / fontSize,
            inlineStyle = ".cap-aligned-line-height { line-height: " + lineHeight + " } .cap-aligned-line-height::before { margin-bottom: -" + topOffsetEm + "em; } .cap-aligned-line-height::after { margin-top: -" + bottomOffsetEm + "em; }";

        $("#cap-aligned-line-height-inline-styles").html(inlineStyle);
    }

    function moveFineTuneAdjustment($lockedLine, $lineList) {
        var $fineTuneAdjustment = $lineList.find("." + fineTuneAdjustmentClass);
        $fineTuneAdjustment.appendTo($lockedLine);
    }

    function lockMeasurementLine(event) {
        var $target = $(event.target),
            $lineList = $target.closest(".cap-height-measurement__lines");
        $lineList.find("." + measurementLineLockedClass).removeClass(measurementLineLockedClass);
        $target.addClass(measurementLineLockedClass);

        moveFineTuneAdjustment($target, $lineList);

        if ($lineList.hasClass(topMeasurementLineListClass)) {
            // Update the top measurement input
            var measurement = $target.index() + 1;
            $("#top-measurement").val(measurement).trigger("change");
        } else {
            // Update the bottom measurement input
            var measurement = $target.index() + 1;
            $("#bottom-measurement").val(measurement).trigger("change");
        }
    }

    function updateIndicator(event, ui) {
        var $target = $(event.target);

            if ($target.closest(".cap-height-measurement__line--bottom").length > 0) {
                var offset = ui.position.top,
                    heightOfSampleBox = $(".cap-height-measurement__sample-text").outerHeight() - 1,
                    value = heightOfSampleBox - offset;                
            } else {
                value = ui.position.top;
            }

            $target.closest(".cap-height-measurement__line").find(".cap-height-measurement__offset").text(value);
            $target.closest(".cap-height-measurement__line").find(".offset-input").val(value).trigger("change");
    }

    function increaseAdjustment(event) {
        var $target = $(event.target),
            $offsetIndicator = $target.closest(".cap-height-measurement__line").find(".cap-height-measurement__offset"),
            currentPosition = $offsetIndicator.text(),
            $measurementLine = $target.closest(".cap-height-measurement__line"),
            $offsetInput = $measurementLine.find(".offset-input"),
            newPosition = parseInt(currentPosition, 10) + 1,
            heightOfSampleBox = $(".cap-height-measurement__sample-text").outerHeight() - 1;

        $offsetIndicator.text(newPosition);
        $offsetInput.val(newPosition).trigger("change");
        if ($measurementLine.hasClass("cap-height-measurement__line--bottom")) {
            newPosition = heightOfSampleBox - newPosition;
        }

        $measurementLine.css({top: newPosition + "px"});
    }

    function decreaseAdjustment(event) {
        var $target = $(event.target),
            $offsetIndicator = $target.closest(".cap-height-measurement__line").find(".cap-height-measurement__offset"),
            currentPosition = $offsetIndicator.text(),
            $measurementLine = $target.closest(".cap-height-measurement__line"),
            $offsetInput = $measurementLine.find(".offset-input"),
            newPosition = Math.max(0, parseInt(currentPosition, 10) - 1),
            heightOfSampleBox = $(".cap-height-measurement__sample-text").outerHeight() - 1;

        $offsetIndicator.text(newPosition);
        $offsetInput.val(newPosition).trigger("change");
        if ($measurementLine.hasClass("cap-height-measurement__line--bottom")) {
            newPosition = heightOfSampleBox - newPosition;
        }

        $measurementLine.css({top: newPosition + "px"});
    }

    function toggleTypefaceInputVisiblity() {
        $(".typeface-action--hidden").removeClass("typeface-action--hidden");

        if ($("#use-custom-typeface").is(":checked")) {
            $(".typeface-action--typeface, .typeface-action--weight-and-style").addClass("typeface-action--hidden");
        } else {
            $(".typeface-action--custom-typeface-name, .typeface-action--custom-typeface-url, .typeface-action--custom-typeface-weight, .typeface-action--custom-typeface-style").addClass("typeface-action--hidden")
        }
        setSampleTextStyles();
    }

    function setEventHandlers() {
        $("#line-height").on('keyup change', syncLineHeight);
        $("#size").on('keyup change', syncFontSize);
        $("#top-measurement").on('keyup change', syncTopMeasurement);
        $("#bottom-measurement").on('keyup change', syncBottomMeasurement);
        $("#typeface").on('change', buildWeightAndStyleSelectBox);
        $("#weight-and-style").on('change', setSampleTextStyles);
        $("input[name='typeface-selection']").on('change', toggleTypefaceInputVisiblity);
        $("#custom-typeface-name").on('keyup change', setSampleTextStyles);
        $("#custom-typeface-weight").on('keyup change', setSampleTextStyles);
        $("#custom-typeface-style").on('keyup change', setSampleTextStyles);
        $("#custom-typeface-url").on('keyup change', setSampleTextStyles);
        $(".measurement-fine-tune__increment--increase").on('click', increaseAdjustment);
        $(".measurement-fine-tune__increment--decrease").on('click', decreaseAdjustment);

        $(".cap-height-measurement__line").draggable({ 
            axis: 'y', 
            containment: 'parent', 
            handle: ".measurement-fine-tune__grip",
            drag: updateIndicator,
            stop: updateIndicator
        });
    }

    function parseWeightAndStyle(string) {
        var weightAndStyle = {
            weight: '400',
            style: 'normal',
            originalString: string
        };

        if (string === 'regular') {
            // Nothing to do, just use defaults
        } else if (string === 'italic') {
            weightAndStyle.style = 'italic';
        } else if (string.indexOf('italic') !== -1) {
            var weight = string.replace('italic', '');
            weightAndStyle.style = 'italic';
            weightAndStyle.weight = weight;
        } else {
            weightAndStyle.weight = string;
        }

        return weightAndStyle;
    }

    function setSampleTextStyles() {
        var fontSize = $("#size").val() + 'px',
            fontFamily = $("#typeface").val(),
            lineHeight = $("#line-height").val(),
            weightAndStyle = parseWeightAndStyle($("#weight-and-style").val()),
            useCustomTypeface = $("#use-custom-typeface").is(":checked"),
            style = "";    


        if (useCustomTypeface) {
            var fontUrl = false;

            fontFamily = $("#custom-typeface-name").val();
            weightAndStyle = {
                weight: $("#custom-typeface-weight").val(),
                style: $("#custom-typeface-style").val()
            };
    
            if ($("#custom-typeface-url").length > 0) {
                fontUrl = $("#custom-typeface-url").val();
            }

            if (fontUrl && $("link[href='" + fontUrl + "']").length === 0) {
                $("head").append("<link rel='stylesheet' href='" + fontUrl + "'>");
            }
        } else {
            var fontUrl = "https://fonts.googleapis.com/css?family=" + fontFamily.replace(/ /g, '+') + ':' + weightAndStyle.originalString;
            WebFont.load({
              google: {
                families: [fontFamily + ":" + weightAndStyle.originalString]
              }
            });
        }

        $(".cap-height-measurement__sample-text").css({fontSize: fontSize, fontFamily: fontFamily + ", monospace", lineHeight: lineHeight, fontWeight: weightAndStyle.weight, fontStyle: weightAndStyle.style});
        $(".sample-font-result").css({fontFamily: fontFamily + ", monospace", fontWeight: weightAndStyle.weight, fontStyle: weightAndStyle.style });
    }

    function getWeightAndStyleVariants() {
        var currentTypeface = $("#typeface").val();
        return typefaceVariantMapping[currentTypeface];
    }

    function buildWeightAndStyleSelectBox() {
        var variants = getWeightAndStyleVariants(),
            $variantSelect = $("#weight-and-style"),
            options = "";

        for (var style in variants) {
            var filepath = variants[style];
            options += '<option value="' + style + '">' + style + '</option>';
        }

        return $variantSelect.html(options).trigger('change');
    }

    function getGoogleFontTypefaces() {
        var typefaces = [];
        for (var i = 0; i < googleFonts.items.length; i++) {
            var font = googleFonts.items[i];
            typefaces.push(font.family);
            typefaceVariantMapping[font.family] = font.files;
        }

        return typefaces;
    }

    function buildFontSelectBox() {
        var googleFonts = getGoogleFontTypefaces(),
            $typefaceSelect = $("#typeface"),
            options = "";

        for (var i = 0; i < googleFonts.length; i++) {
            var selected = '',
                typeface = googleFonts[i];

            if (typeface === 'Lato') {
                selected = 'selected';
            }

            options += '<option value="' + typeface + '" ' + selected + '>' + typeface + '</option>';
        }

        $typefaceSelect.html(options);
    }

    function syncValuesOnLoad() {
        syncLineHeight();
        syncFontSize();
        syncTopMeasurement();
        syncBottomMeasurement();
        buildWeightAndStyleSelectBox();
        setSampleTextStyles();
    }


    var initialize = function initialize() {
        buildFontSelectBox();
        setEventHandlers();
        syncValuesOnLoad();
    };

    return {
        "initialize": initialize
    };
}();

$(document).ready(CapHeightAlignmentTool.initialize);