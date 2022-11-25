const option_defaults = new Map([
    ["charge_text", 'Visa ending in 1234:'],
    ["paying_account", 'Liabilities:Credit:Freedom'],
    ["tax_account", "Expenses:Taxes:Consumer"],
    ["shipping_account", "Expenses:Shipping"],
    ["expense_account", "Expenses:Misc"],
]);

class Options
{
    constructor()
    {
        this.charge_text = option_defaults["charge_text"];
        this.paying_account = option_defaults["paying_account"];
        this.tax_account = option_defaults["tax_account"];
        this.shipping_account = option_defaults["shipping_account"];
        this.expense_account = option_defaults["expense_account"];
    }
}

let options = new Options();
browser.storage.sync.get().then((opts) => {
    for(const [key, value] of option_defaults)
    {
        options[key] = opts[key] || value;
    }
});

if(typeof(String.prototype.trim) === "undefined")
{
    String.prototype.trim = function()
    {
        return String(this).replace(/^\s+|\s+$/g, '');
    };
}

if(typeof(String.prototype.searchBetween) === "undefined")
{
    String.prototype.searchBetween = function(begin_pattern, end_pattern)
    {
        let s = String(this);
        let begin = s.search(begin_pattern) + begin_pattern.length;
        let end = s.substring(begin).search(end_pattern) + begin;
        return s.substring(begin, end);
    };
}

class Order
{
    constructor()
    {
        this.date = new Date();
        this.title = "";
        this.price = 0;
        this.tax = 0;
        this.shipping = 0;
        this.charged = 0;
        this.number = "";
    }
}

class OrderReader
{
    constructor() {}

    // Fetch the invoice by taking the URL from the order node.
    #orderNodeToFetch(order_node)
    {
        const links = order_node.querySelectorAll("a.a-link-normal");
        var detail_uri = undefined;
        for(var i = 0; i < links.length; i++)
        {
            if(links[i].textContent.trim() == "View invoice")
            {
                detail_uri = links[i].href;
                break;
            }
        }

        return fetch(detail_uri).then((response) => {
            if(response.status != 200) {
                return null;
            }
            else
            {
                return response.text();
            }
        });
    }

    #parseInvoiceKeyValue(invoice_doc, key)
    {
        for(const node of invoice_doc.querySelectorAll("td"))
        {
            if(node.textContent.trim() == key)
            {
                return node.nextElementSibling.textContent.trim();
            }
        }
        return "$0";
    }

    // “-$12.34” –> -12.34
    #parseDollarAmount(s)
    {
        if(s[0] == "-")
        {
            return -parseFloat(s.substring(2));
        }
        else
        {
            return parseFloat(s.substring(1));
        }
    }

    // This is probably the most brittle function here. Extract order
    // info from the invoice page.
    #invoiceToOrder(html)
    {
        let order = new Order();
        // Extract order number
        let title = html.searchBetween("<b class=\"h1\">", "</b>").trim();
        let title_match = title.match(/Final Details for Order #(.*)/);
        if(title_match === null)
        {
            // This usually means the order has not settled yet.
            return null;
        }
        order.number = title_match[1];

        let parser = new DOMParser();
        let doc = parser.parseFromString(html, "text/html");
        order.title = doc.querySelectorAll("i")[0].textContent.trim();
        // Look for the total charged amount by matching the text
        // prefix in a <td>.
        for(const node of doc.querySelectorAll("td"))
        {
            const text = node.innerText.trim();
            const trans_begin = options.charge_text;
            if(!text.startsWith(trans_begin) || node.childElementCount > 0)
            {
                continue;
            }

            order.date = new Date(text.substring(trans_begin.length + 1,
                                                 text.length - 1));
            order.charged = this.#parseDollarAmount(
                node.nextElementSibling.innerText.trim());
            break;
        }
        if(order.charged === 0.0)
        {
            // This probably means the finantial transaction has not
            // happened yet, unless the purchase is really free...
            return null;
        }

        let price = this.#parseDollarAmount(
            this.#parseInvoiceKeyValue(doc, "Item(s) Subtotal:"));
        let reward = this.#parseDollarAmount(
            this.#parseInvoiceKeyValue(doc, "Rewards Points:"));
        order.price = price + reward;
        order.tax = this.#parseDollarAmount(
            this.#parseInvoiceKeyValue(doc, "Estimated tax to be collected:"));
        order.shipping = this.#parseDollarAmount(
            this.#parseInvoiceKeyValue(doc, "Shipping & Handling:"));
        return order;
    }

    async readOrders()
    {
        let thunks = new Array();
        for(const node of document.querySelectorAll(".order-card"))
        {
            thunks.push(this.#orderNodeToFetch(node));
        }
        let orders = new Array();
        for(var fetch_thunk of thunks)
        {
            let html = await fetch_thunk;
            let order = this.#invoiceToOrder(html);
            if(order !== null)
            {
                orders.push(order);
            }
        }
        return orders;
    }
}

class OrderWriter
{
    constructor() {}

    writeAsString(order)
    {
        let lines = new Array();
        let date = `${order.date.getFullYear()}-\
${(order.date.getMonth()+1).toString().padStart(2, '0')}-\
${order.date.getDate().toString().padStart(2, '0')}`;
        lines.push(`${date} * "Amazon" "${order.title}"`);
        lines.push(`  order-number: ${order.number}`);
        lines.push(`  ${options.expense_account} \
${order.price.toFixed(2)} USD`);
        if(order.tax > 0.0)
        {
            lines.push(`  ${options.tax_account} ${order.tax.toFixed(2)} USD`);
        }
        if(order.shipping > 0.0)
        {
            lines.push(`  ${options.shipping_account} \
${order.shipping.toFixed(2)} USD`);
        }
        lines.push(`  ${options.paying_account} \
-${order.charged.toFixed(2)} USD`);
        return lines.join('\n');
    }
}

async function run()
{
    let reader = new OrderReader();
    let writer = new OrderWriter();
    let orders = await reader.readOrders();
    orders.sort((o1, o2) => o1.date - o2.date);
    const result = orders.map((order) => writer.writeAsString(order))
          .join("\n\n");

    let bean_node = document.getElementById("amazon-bean");
    if(bean_node === null)
    {
        bean_node = document.createElement("pre")
        bean_node.style["font-family"] = "monospace";
        bean_node.style["border"] = "5px solid green";
        bean_node.style["background-color"] = "white";
        bean_node.style["padding"] = "20px";
        bean_node.id = "amazon-bean";
        document.querySelector("body")
            .insertAdjacentElement("afterbegin", bean_node);
    }
    bean_node.innerText = result;
}

function prepareDocument()
{
    if(document.getElementById("bean-it") === null)
    {
        let toolbar = document.querySelector(
            ".js-yo-main-content > .a-row.a-spacing-medium");

        let orig_btns = toolbar.querySelectorAll(".a-span6");
        for(let node of orig_btns)
        {
            node.classList.remove("a-span6");
            node.classList.add("a-span5");
            if(node.classList.contains("a-span-last"))
            {
                node.classList.remove("a-span-last");
            }
        }
        let button = document.createElement("a")
        button.href="#";
        button.innerText = "Bean!";
        button.onclick = function() { run(); };

        let btn_container = document.createElement("div");
        btn_container.classList.add("a-column");
        btn_container.classList.add("a-span2");
        btn_container.classList.add("a-span-last");
        btn_container.appendChild(button);
        btn_container.id = "bean-it";
        btn_container.style["margin-top"] = "7px";

        toolbar.appendChild(btn_container);
    }
}

prepareDocument();
