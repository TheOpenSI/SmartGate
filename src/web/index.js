// JavaScript source code
$(document).ready(function () {

    var body = $("#body");

    var statswindow = $("#statswindow");

    var video = $("#video");

    var vidwrapper = $("#vidwrapper");

    var camarr = [1, 2, 3, 4];

    var counter = 0;

    var numberofcams = camarr.length;

    var buttonnext = "<button class='cycle' id='next'>Next &raquo;</button>";

    var buttonprevious = "<button class='cycle' id='previous'>&laquo; Previous</button>";

    var buttonopen = "<button class='control' id='open'>Open</button>";

    var buttonclose = "<button class='control' id='close'>Close</button>";

    //This should make it so we can traverse through multiple cameras, but as of right now we only have one camera set up.
    vidwrapper.append(
        "<div id='cylebuttons'><div id='prevcontainer' class='buttoncontainer'>" + buttonprevious + "</div><div id='nextcontainer' class='buttoncontainer'>" + buttonnext + "</div></div>"
    );

    vidwrapper.append(
        "<div id='controlbuttons'><div id='opencontainer' class='buttoncontainer'>" + buttonopen + "</div><div id='closecontainer' class='buttoncontainer'>" + buttonclose + "</div></div>"
    );

    //Traverse through next camera stream
    $("#next").on("click", function () {
        counter = (counter + 1) % numberofcams;
        $("#footage").attr('src', "image" + camarr[counter] + ".jpg"); 
    });

    //Traverse through previous camera stream
    $("#previous").on("click", function () {
        counter = (counter - 1 + numberofcams) % numberofcams;
        $("#footage").attr('src', "image" + camarr[counter] + ".jpg"); 
    });

    //----- Send respective POST request to open or close door for manual intervention. -----
    //Example JSON format:
    // {"command" : "OPEN_DOOR"}
    // {"command" : "CLOSE_DOOR"}

    $("#open").on("click", function () {
        $.ajax({
            url: '/',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ command: "OPEN_DOOR" }),
            success: function(response) {
                console.log('[+] Open door command sent successfully');
            },
            error: function(xhr, status, error) {
                console.error('[-] Error sending open door command:', error);
            }
        });
    });

    $("#close").on("click", function () {
        $.ajax({
            url: '/',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ command: "CLOSE_DOOR" }),
            success: function(response) {
                console.log('[+] Close door command sent successfully');
            },
            error: function(xhr, status, error) {
                console.error('[-] Error sending close door command:', error);
            }
        });
    });

    //------ Obtain statistics from the Jetson Nano -------
    //We could make it autoupdate, but making it manually obtained would be good for now because of potential performance impacts and to avoid unnecessary network traffic
    //Click event for the "Get Status" button
    $("#getStatus").on("click", function () {
        $.ajax({
            url: '/status',
            type: 'GET',
            dataType: 'json',
            success: function(data) {
                var statusHtml = '<h3>Jetson Nano Status:</h3>' +
                                 '<p>CPU Temperature: ' + data.cpu_temperature + '</p>' +
                                 '<p>CPU Usage: '       + data.cpu_usage       + '</p>' +
                                 '<p>Memory Usage: '    + data.memory_usage    + '</p>' +
                                 '<p>Disk Usage: '      + data.disk_usage      + '</p>' +
                                 '<h3>Motor Board Status</h3>' +
                                 '<p>Door state: '      + data.door_state + '</p>' +
                                 '<p>Door opening: '    + data.is_door_opening + '</p>' +
                                 '<p>Door closing: '    + data.is_door_closing + '</p>';
                $('.stat').html(statusHtml);
            },
            error: function(xhr, status, error) {
                console.error('[-] Error fetching status:', error);
                $('.stat').html('<p>Error fetching status</p>');
            }
        });
    });

});
