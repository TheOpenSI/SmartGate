// Opens and closes the user menu when the profile picture is clicked
const avatar = document.querySelector(".profile-avatar");
const userMenu = document.getElementById("userMenu");

if (avatar && userMenu) {
    avatar.style.cursor = "pointer";

    avatar.addEventListener("click", (e) => {
        e.stopPropagation();
        userMenu.style.display = (userMenu.style.display === "block") ? "none" : "block";
    });

    // Clicking anywhere else closes the menu
    document.addEventListener("click", (e) => {
        if (!userMenu.contains(e.target)) {
            userMenu.style.display = "none";
        }
    });
}
