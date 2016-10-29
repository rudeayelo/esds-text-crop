CapHeightAlignmentTool = function() {
    "use strict";
    var measurementLineLockedClass = "cap-height-measurement__line--locked",
        topMeasurementLineListClass = "cap-height-measurement__lines--top",
        bottomMeasurementLineListClass = "cap-height-measurement__lines--bottom",
        fineTuneAdjustmentClass = "measurement-fine-tune";

    function syncLineHeight() {
        $(".code-line-height").text($("#line-height").val());
    }

    function syncFontSize() {
        $(".code-size").text($("#size").val());
        setSampleTextStyles();
    }

    function syncTopMeasurement() {
        $(".code-top-measurement").text($("#top-measurement").val());
    }

    function syncBottomMeasurement() {
        $(".code-bottom-measurement").text($("#bottom-measurement").val());
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

    function setEventHandlers() {
        $("#line-height").on('keyup change', syncLineHeight);
        $("#size").on('keyup change', syncFontSize);
        $("#top-measurement").on('keyup change', syncTopMeasurement);
        $("#bottom-measurement").on('keyup change', syncBottomMeasurement);
        $("#typeface").on('change', setSampleTextStyles);
        $(".cap-height-measurement__line").on('click', lockMeasurementLine);
    }

    function setSampleTextStyles() {
        var fontSize = $("#size").val() + 'px',
            fontFamily = $("#typeface").val();
        $(".cap-height-measurement__sample-text").css({fontSize: fontSize, fontFamily: fontFamily});
        
        // if ($("#inline-styles").length == 0) {
        //     $("head").append("<style id='inline-styles'>");
        // }

        // $("#inline-styles").append(" .cap-height-measurement__sample-text { font-family: '" + fontFamily + "'; }")
    }

    function syncValuesOnLoad() {
        syncLineHeight();
        syncFontSize();
        syncTopMeasurement();
        syncBottomMeasurement();
        // setSampleTextStyles();
    }


    var initialize = function initialize() {
        setEventHandlers();
        syncValuesOnLoad();
    };

    return {
        "initialize": initialize
    };
}();

$(document).ready(CapHeightAlignmentTool.initialize);