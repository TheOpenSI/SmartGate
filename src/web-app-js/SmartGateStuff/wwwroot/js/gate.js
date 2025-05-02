document.addEventListener('DOMContentLoaded', () => {
    // Select all camera feed elements
    const cameraFeeds = document.querySelectorAll('.camera-feed');

    cameraFeeds.forEach(feed => {
        const openBtn = feed.querySelector('.btn.open');
        const closeBtn = feed.querySelector('.btn.close');
        const statusText = feed.querySelector('.status');
        const gateText = feed.querySelector('.feed-info span').textContent;
        // Extract the gate number (only the number part) from the text
        const gateNo = gateText.match(/\d+/)[0];  // This extracts just the number (e.g., '1')
        // Extract just the status (Closed or Open) from the text content of the status element
        const currentStatus = statusText.textContent.split(':')[1]?.trim(); // This will extract 'Closed' or 'Open'

        // Function to push gate data to the DB
        const pushGateDataToDb = async (gateNo, gateStatus) => {
            try {
                const response = await fetch('/add_gate_data', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        gate_no: gateNo,
                        gate_status: gateStatus,
                    }),
                });
                const data = await response.json();
                console.log('Gate data pushed:', data.message);
            } catch (error) {
                console.error('Error pushing gate data to DB:', error);
            }
        };
        
        pushGateDataToDb(gateNo, currentStatus)  

        // Function to update the gate status
        const updateGateStatus = (status) => {
            feed.setAttribute('data-status', status);
            statusText.textContent = `Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
            statusText.className = `status ${status}`;

            // Update button active states
            if (status === 'open') {
                openBtn.classList.add('active');
                closeBtn.classList.remove('active');
            } else {
                closeBtn.classList.add('active');
                openBtn.classList.remove('active');
            }
            
            const gateNo = feed.getAttribute('data-gate-no');

            // function to update gate status 
            // Chatgpt enter here:      
            const notifyBackendGateUpdate = async (gateNo, status) => {
                try {
                    const res = await fetch('/update_gate_data', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            gate_no: gateNo,
                            new_status: status,
                        }),
                    });
                    const data = await res.json();
                    console.log('Backend confirmed:', data.message);
                } catch (error) {
                    console.error('Backend update failed:', error);
                }
            };
            notifyBackendGateUpdate(gateNo, status.charAt(0).toUpperCase() + status.slice(1));
        };
        
        // Event listener for the OPEN button
        openBtn.addEventListener('click', () => {
            checkUserPermission('open_gate').then((allowed) => {
                if (allowed === null) {
                    alert("You need to log in to open the gate.");
                } else if (allowed) {
                    updateGateStatus('open');
                } else {
                    alert("You don't have permission to open the gate.");
                }
            }).catch((error) => {
                console.error("Error checking permission:", error);
            });
        });

        // Event listener for the CLOSE button
        closeBtn.addEventListener('click', () => {
            checkUserPermission('close_gate').then((allowed) => {
                if (allowed === null) {
                    alert("You need to log in to close the gate.");
                } else if (allowed) {
                    updateGateStatus('closed');
                } else {
                    alert("You don't have permission to close the gate.");
                }
            }).catch((error) => {
                console.error("Error checking permission:", error);
            });
        });

    });
});

async function checkUserPermission(permission) {
    try {
        const userResponse = await fetch('/get-username');
        const userData = await userResponse.json();
        if (userData.error) {
            return null; // Not logged in
        }

        const username = userData.username;
        const permissionResponse = await fetch(`/check-permission?username=${username}&perm_name=${permission}`);
        const permissionData = await permissionResponse.json();

        return permissionData.allowed;
    } catch (error) {
        console.error("Error checking permission:", error);
        return false;
    }
}
