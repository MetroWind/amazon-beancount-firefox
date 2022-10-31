const option_defaults = new Map([
    ["charge_text", 'Visa ending in 1234:'],
    ["paying_account", 'Liabilities:Credit:Freedom'],
    ["tax_account", "Expenses:Taxes:Consumer"],
    ["shipping_account", "Expenses:Shipping"],
    ["expense_account", "Expenses:Misc"],
]);

function saveOptions(e)
{
    let settings = {};
    for(const [key, _] of option_defaults)
    {
        settings[key] = document.querySelector("#" + key).value;
    }
    browser.storage.sync.set(settings);
    e.preventDefault();
}

function restoreOptions()
{
    let gettingItem = browser.storage.sync.get();
    gettingItem.then((res) => {
        for(const [key, value] of option_defaults)
        {
            document.querySelector("#" + key).value = res[key] || value;
        }
    });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
