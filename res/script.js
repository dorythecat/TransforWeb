// Global variables
const URL_REGEX = /[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&\/=]*)/

// TSF utilities
// See https://dorythecat.github.io/TransforMate/commands/transformation/export_tf.html#transformation-string-format
function encode_tsf(into, image_url, options = {
    big: false,
    small: false,
    hush: false,
    backwards: false,
    stutter: 0,
    bio: null,
    prefixes: [],
    suffixes: [],
    sprinkles: [],
    muffles: [],
    alt_muffles: [],
    censors: []
}) {
    // Helper function to process arrays
    const processArray = (arr) =>
        !arr?.length ? "" : [arr.map(({content, value}) => `${content}|%${value}`).join(",%")];

    // Generate arrays and make it into the proper data to return
    return ["2.0",
            into,
            image_url,
            (Number(options.big) << 0) + (Number(options.small) << 1) + (Number(options.hush) << 2) + (Number(options.backwards) << 3),
            options.stutter.toString(),
            options.bio ?? "",
            processArray(options.prefixes),
            processArray(options.suffixes),
            processArray(options.sprinkles),
            processArray(options.muffles),
            processArray(options.alt_muffles),
            processArray(options.censors)
    ].join(";%");

}

function decode_tsf(tsf) {
    let sep = ";";
    if (tsf.includes(";%")) sep = ";%";
    tsf = tsf.split(sep);

    const version = Number(tsf[0]);
    if ((version === 15 && tsf.length !== 23) &&
        (version === 1 && tsf.length !== 20) &&
        (version === 2 && tsf.length !== 12)) return;

    if (version === 2) {
        const getArrayV2 = (index) => {
            if (tsf[index] === "") return [];
            return tsf[index].split(",%").map(p => {
                const [content, value] = p.split("|%");
                return {content, value};
            });
        }

        return {
            into: tsf[1],
            image_url: tsf[2],
            big: (Number(tsf[3]) & 1) === 1,
            small: (Number(tsf[3]) & 2) === 2,
            hush: (Number(tsf[3]) & 4) === 4,
            backwards: (Number(tsf[3]) & 8) === 8,
            stutter: Number(tsf[4]),
            bio: tsf[5],
            prefixes: getArrayV2(6),
            suffixes: getArrayV2(7),
            sprinkles: getArrayV2(8),
            muffles: getArrayV2(9),
            alt_muffles: getArrayV2(10),
            censors: getArrayV2(11)
        }
    }

    const getArrayV1 = (index) => {
        if (tsf[index] === "0") return [];
        return tsf[index + 1].split(sep === ";%" ? ",%" : ",").map(p => {
            const [content, value] = p.split(sep === ";%" ? "|%" : "|");
            return {content, value};
        });
    }

    return {
        into: tsf[1],
        image_url: tsf[2],
        big: (version === 15 && tsf[3] === "1") || (version === 1 && (Number(tsf[3]) & 1) === 1),
        small: (version === 15 && tsf[4] === "1") || (version === 1 && (Number(tsf[3]) & 2) === 2),
        hush: (version === 15 && tsf[5] === "1") || (version === 1 && (Number(tsf[3]) & 4) === 4),
        backwards: (version === 15 && tsf[6] === "1") || (version === 1 && (Number(tsf[3]) & 8) === 8),
        stutter: Number(version === 15 ? tsf[7] : tsf[4]),
        proxy_prefix: version === 15 ? tsf[8] : tsf[5],
        proxy_suffix: version === 15 ? tsf[9] : tsf[6],
        bio: version === 15 ? tsf[10] : tsf[7],
        prefixes: getArrayV1(version === 15 ? 11 : 8),
        suffixes: getArrayV1(version === 15 ? 13 : 10),
        sprinkles: getArrayV1(version === 15 ? 15 : 12),
        muffles: getArrayV1(version === 15 ? 17 : 14),
        alt_muffles: getArrayV1(version === 15 ? 19 : 16),
        censors: getArrayV1(version === 15 ? 21 : 18)
    }
}

// TSF Editor page
if (window.location.href.includes("tsf_editor.html")) {
    const elements = {
        new_tf_name: document.getElementById("new_tf_name"),
        new_tf_img: document.getElementById("new_tf_img"),
        new_tf_submit: document.getElementById("new_tf_submit"),
        new_tf_container: document.getElementById("new_tf_container"),
        tf_file_container: document.getElementById("tf_file_container"),
        tf_data_form: document.getElementById("tf_data_form"),
        big: document.getElementById("big"),
        small: document.getElementById("small"),
        hush: document.getElementById("hush"),
        backwards: document.getElementById("backwards"),
        bio: document.getElementById("bio")
    };

    const sliderPairs = [
        { name: 'stutter', default: 0 },
        { name: 'prefix_chance', default: 30 },
        { name: 'suffix_chance', default: 30 },
        { name: 'sprinkle_chance', default: 30 },
        { name: 'muffle_chance', default: 30 },
        { name: 'alt_muffle_chance', default: 30 }
    ].map(({ name, default: defaultValue }) => ({
        slider: document.getElementById(name),
        value: document.getElementById(`${name}_value`),
        defaultValue
    }));

    const syncSliderPair = (pair) => {
        const syncValues = (event) => {
            pair.slider.value = pair.value.value = event.target.value;
        };
        pair.slider.addEventListener("input", syncValues);
        pair.value.addEventListener("input", syncValues);
    };

    sliderPairs.forEach(syncSliderPair);

    const listConfigs = ['prefix', 'suffix', 'sprinkle', 'muffle', 'alt_muffle', 'censor']
        .reduce((acc, id) => {
            acc[id] = {
                list: [],
                container: document.getElementById(`${id}_container`),
                contentInput: document.getElementById(`${id}_content`),
                ...(id === 'censor'
                    ? { replacementInput: document.getElementById('censor_replacement') }
                    : { chancePair: sliderPairs[sliderPairs.findIndex(p => p.slider.id.includes(id))] })
            };
            return acc;
        }, {});

    const updateList = (ID) => {
        const { list, container } = listConfigs[ID];
        container.innerHTML = list
            .map((item, index) => `
                <li class="item">
                    <span>${item.content} (${item.value}${ID === 'censor' ? "" : "%"})</span>
                    <button type="button" onclick="removeFunction(${index}, '${ID}')">Remove</button>
                </li>`)
            .join('');
    };

    window.removeFunction = (index, ID) => {
        listConfigs[ID].list.splice(index, 1);
        updateList(ID);
    };

    Object.entries(listConfigs).forEach(([ID, config]) => {
        const isCensor = ID === 'censor';
        document.getElementById(`add_${ID}_btn`)
            .addEventListener('click', () => {
                const valueInput = isCensor ? config.replacementInput.value : config.chancePair.slider.value;
                if (!config.contentInput.value || !valueInput) return;

                config.list.push({
                    content: config.contentInput.value,
                    value: valueInput
                });

                updateList(ID);

                config.contentInput.value = '';
                if (isCensor) config.replacementInput.value = '';
                else {
                    config.chancePair.slider.value = config.chancePair.defaultValue;
                    config.chancePair.value.value = config.chancePair.defaultValue;
                }
            });
    });

    elements.new_tf_submit.onclick = () => {
        const { new_tf_name, new_tf_img } = elements;
        new_tf_name.value = new_tf_name.value.trim();
        new_tf_img.value = new_tf_img.value.trim();
        if (!new_tf_name.value || !new_tf_img.value) {
            alert("Please fill out all required fields!");
            return;
        }
        if (new_tf_name.value.length < 2) {
            alert("Name must be at least 2 characters long!");
            return;
        }
        const ok = URL_REGEX.exec(new_tf_img.value);
        if (!ok) {
            alert("Image URL must be a valid URL!");
            return;
        }
        if (!new_tf_img.value.startsWith("http")) new_tf_img.value = `http://${new_tf_img.value}`;
        if (new_tf_img.value.includes("?")) new_tf_img.value = new_tf_img.value.split("?")[0]; // Trim
        elements.tf_data_form.style.display = "inline";
        elements.new_tf_submit.style.display = "none";
        elements.tf_file_container.style.display = "none";
    };

    document.getElementById("submit_tf_btn").onclick = async () => {
        // Generate TSF string with provided data
        const tsf_data = encode_tsf(
            elements.new_tf_name.value,
            elements.new_tf_img.value,
            {
                big: elements.big.checked,
                small: elements.small.checked,
                hush: elements.hush.checked,
                backwards: elements.backwards.checked,
                stutter: parseInt(document.getElementById("stutter_value").value),
                bio: elements.bio.value,
                prefixes: listConfigs.prefix.list,
                suffixes: listConfigs.suffix.list,
                sprinkles: listConfigs.sprinkle.list,
                muffles: listConfigs.muffle.list,
                alt_muffles: listConfigs.alt_muffle.list,
                censors: listConfigs.censor.list
            }
        );

        // Set output text
        const new_tf_output = document.getElementById("new_tf_output");
        new_tf_output.value = tsf_data;

        // Select and copy the output when the associated button is pressed
        document.getElementById("copy_tf_output").onclick = () => {
            new_tf_output.select();
            new_tf_output.setSelectionRange(0, 99999); // Mobile compatibility
            navigator.clipboard.writeText(new_tf_output.value).then(
                () => alert("Copied to clipboard!"),
                () => alert("Failed to copy to clipboard!")
            );
        }

        // Download the TSF-compliant file when the associated button is pressed
        document.getElementById("download_tf_output").onclick = () => {
            const element = document.createElement('a');
            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(tsf_data));
            element.setAttribute('download', `${elements.new_tf_name.value}.tsf`);
            element.click();
            element.remove();
        }

        document.getElementById("tf_submit_output").style.display = "block";
    };

    const inputElement = document.getElementById("tf_file_input");
    inputElement.addEventListener("change", handleFiles, false);
    function handleFiles() {
        const fileList = this.files;
        const file = fileList[0];
        const reader = new FileReader();
        reader.readAsText(file);
        // The file contains a TSF string to decode
        reader.onload = function (e) {
            const data = decode_tsf(e.target.result);
            if (!data) return;

            elements.new_tf_name.value = data.into;
            elements.new_tf_img.value = data.image_url;
            elements.big.checked = data.big;
            elements.small.checked = data.small;
            elements.hush.checked = data.hush;
            elements.backwards.checked = data.backwards;
            elements.bio.value = data.bio;

            document.getElementById("stutter").value = data.stutter;
            document.getElementById("stutter_value").value = data.stutter;

            // We need to pair them since they have different names.
            const pairs = {
                'prefix': 'prefixes',
                'suffix': 'suffixes',
                'sprinkle': 'sprinkles',
                'muffle': 'muffles',
                'alt_muffle': 'alt_muffles',
                'censor': 'censors'
            }

            for (const [key, value] of Object.entries(pairs)) {
                const list = listConfigs[key].list;
                const dataList = data[value];
                for (const [index, item] of dataList.entries()) {
                    list[index] = {
                        content: item.content,
                        value: item.value
                    }
                }
                updateList(key);
            }

            elements.tf_data_form.style.display = "inline";
            elements.new_tf_submit.style.display = "none";
            elements.tf_file_container.style.display = "none";
        }
    }
}

// Theme toggle utility
function setTheme(theme) {
    document.documentElement.setAttribute('data_theme', theme);
    localStorage.setItem('theme', theme);

    // Update the icon
    const themeToggle = document.getElementById('theme_toggle');
    themeToggle.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

// Initialize theme
// Check for saved theme preference or default to dark theme
setTheme(localStorage.getItem('theme') || 'dark');

// Add click event listener to the theme toggle button
const themeToggle = document.getElementById('theme_toggle');
themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data_theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
});

function toggleMenu() {
    const x = document.getElementsByClassName("topnav")[0];
    if (x.className === "topnav") x.className += " responsive";
    else x.className = "topnav";
}