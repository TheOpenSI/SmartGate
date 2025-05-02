document.addEventListener('DOMContentLoaded', () => {
    // Dropdown Functionality for SETTINGS
    // const dropdown = document.querySelector('.dropdown');
    // const dropdownLink = dropdown.querySelector('a'); // The "SETTINGS" link
    // const dropdownContent = document.querySelector('.dropdown-content');
    // const brightnessSlider = document.querySelector('#brightness-slider');
    // const themeToggle = document.querySelector('#theme-toggle');
    // const volumeSlider = document.querySelector('#volume-slider');
    // const fontSizeSlider = document.querySelector('#font-size-slider');
    // const blurSlider = document.querySelector('#blur-slider');
    // const autoLogoutInput = document.querySelector('#auto-logout');
    // const applySettingsBtn = document.querySelector('#apply-settings');
    // const body = document.body;

    // dropdownLink.addEventListener('click', (e) => {
    //     e.preventDefault();
    //     e.stopPropagation();
    //     dropdownContent.style.display =
    //         dropdownContent.style.display === 'block' ? 'none' : 'block';
    // });

    // document.addEventListener('click', (e) => {
    //     if (!dropdown.contains(e.target)) {
    //         dropdownContent.style.display = 'none';
    //     }
    // });

    // dropdownContent.addEventListener('click', (e) => {
    //     e.stopPropagation();
    // });

    // // ✅ Brightness Control
    // brightnessSlider.addEventListener('input', () => {
    //     const brightnessValue = brightnessSlider.value / 100;
    //     body.style.filter = `brightness(${brightnessValue})`;
    // });

    // // ✅ Theme Toggle (Dark Mode)
    // themeToggle.addEventListener('change', () => {
    //     if (themeToggle.checked) {
    //         body.classList.add('dark-mode');
    //     } else {
    //         body.classList.remove('dark-mode');
    //     }
    // });

    // // ✅ Volume Control (Simulated)
    // volumeSlider.addEventListener('input', () => {
    //     console.log(`Volume set to: ${volumeSlider.value}%`);
    // });

    // // ✅ Font Size Adjustment
    // fontSizeSlider.addEventListener('input', () => {
    //     document.documentElement.style.fontSize = `${fontSizeSlider.value}px`;
    // });

    // // ✅ Background Blur Effect
    // blurSlider.addEventListener('input', () => {
    //     document.querySelector('.overlay').style.backdropFilter = `blur(${blurSlider.value}px)`;
    // });

    // // ✅ Auto Logout Timer
    // applySettingsBtn.addEventListener('click', () => {
    //     const autoLogoutMinutes = parseInt(autoLogoutInput.value, 10);
    //     if (autoLogoutMinutes > 0) {
    //         console.log(`Auto Logout set to ${autoLogoutMinutes} minutes.`);
    //         setTimeout(() => {
    //             alert("You have been logged out due to inactivity.");
    //             window.location.href = "/logout"; // Redirect to logout page
    //         }, autoLogoutMinutes * 60000);
    //     }
    // });

    // ✅ Gate Toggle Functionality
    const toggleButtons = document.querySelectorAll(".toggle-gate");

    toggleButtons.forEach(button => {
        button.addEventListener("click", function () {
            const gateSection = this.parentElement;
            const statusSpan = gateSection.querySelector(".status");

            if (statusSpan.textContent === "OPEN") {
                statusSpan.textContent = "CLOSED";
                statusSpan.style.color = "red";
            } else {
                statusSpan.textContent = "OPEN";
                statusSpan.style.color = "green";
            }
        });
    });

    // ✅ Camera Navigation Buttons
    const cameraImages = ["image1.jpg", "image2.jpg", "image3.jpg", "image4.jpg"];
    let currentCameraIndex = 0;
    const footage = document.getElementById("footage");

    document.getElementById("next").addEventListener("click", function () {
        currentCameraIndex = (currentCameraIndex + 1) % cameraImages.length;
        footage.src = cameraImages[currentCameraIndex];
    });

    document.getElementById("previous").addEventListener("click", function () {
        currentCameraIndex =
            (currentCameraIndex - 1 + cameraImages.length) % cameraImages.length;
        footage.src = cameraImages[currentCameraIndex];
    });

    // ✅ Open and Close Door with AJAX Request
    document.getElementById("open").addEventListener("click", function () {
        fetch("/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "OPEN_DOOR" }),
        })
            .then(() => console.log("[+] Open door command sent successfully"))
            .catch((error) =>
                console.error("[-] Error sending open door command:", error)
            );
    });

    document.getElementById("close").addEventListener("click", function () {
        fetch("/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "CLOSE_DOOR" }),
        })
            .then(() => console.log("[+] Close door command sent successfully"))
            .catch((error) =>
                console.error("[-] Error sending close door command:", error)
            );
    });

    // ✅ Fetch Jetson Nano Status
    document.getElementById("getStatus").addEventListener("click", function () {
        fetch("/status")
            .then((response) => response.json())
            .then((data) => {
                const statusHtml = `
                    <h3>Jetson Nano Status:</h3>
                    <p>CPU Temperature: ${data.cpu_temperature}</p>
                    <p>CPU Usage: ${data.cpu_usage}</p>
                    <p>Memory Usage: ${data.memory_usage}</p>
                    <p>Disk Usage: ${data.disk_usage}</p>
                    <h3>Motor Board Status</h3>
                    <p>Door state: ${data.door_state}</p>
                    <p>Door opening: ${data.is_door_opening}</p>
                    <p>Door closing: ${data.is_door_closing}</p>
                `;
                document.querySelector(".stat").innerHTML = statusHtml;
            })
            .catch((error) => {
                console.error("[-] Error fetching status:", error);
                document.querySelector(".stat").innerHTML =
                    "<p>Error fetching status</p>";
            });
    });

    // ✅ Dark Mode Styling (CSS)
    const darkModeStyles = document.createElement("style");
    darkModeStyles.innerHTML = `
        .dark-mode {
            background-color: #121212;
            color: #ffffff;
        }
        .dark-mode nav, .dark-mode footer {
            background-color: #1a1a1a;
        }
        .dark-mode .dropdown-content {
            background-color: #2a2a2a;
            color: white;
        }
    `;
    document.head.appendChild(darkModeStyles);
});

function toggleUserMenu() {
    const userMenu = document.getElementById('userMenu');
    userMenu.style.display = (userMenu.style.display === 'block') ? 'none' : 'block';
}
