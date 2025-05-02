// spa.js

// Utility to create route handlers
function createRoute(page) {
    return async () => {
        const content = await fetchPageContent(page);
        document.getElementById('app').innerHTML = content;
    };
}

// Handle client-side routing
const routes = {
    '/': createRoute('index'),
    '/users': createRoute('users'),
    '/alerts': createRoute('alerts')
};

// Fetch the HTML content for a specific page
async function fetchPageContent(page) {
    try {
        const response = await fetch(`/public/${page}.html`);
        if (response.ok) {
            return await response.text();
        } else {
            return '<h2>404 - Page Not Found</h2>';
        }
    } catch (error) {
        console.error('Error fetching page:', error);
        return '<h2>500 - Internal Server Error</h2>';
    }
}

// Listen for clicks on links to handle client-side routing
document.body.addEventListener('click', function (event) {
    if (event.target.matches('[data-link]')) {
        event.preventDefault();
        window.history.pushState({}, '', event.target.href);
        handleRoute();
    }
});

// Handle route based on URL
function handleRoute() {
    const path = window.location.pathname;
    const route = routes[path];
    if (route) {
        route();
    } else {
        document.getElementById('app').innerHTML = '<h2>404 - Page Not Found</h2>';
    }
}

// Handle initial load
window.addEventListener('popstate', handleRoute);
handleRoute();
