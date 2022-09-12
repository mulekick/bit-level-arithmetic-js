import {chalk, table, DataViewAugmented, le, NUMBER_16_BITS, NUMBER_32_BITS, addFloatingPoint, subtractFloatingPoint, multiplyFloatingPoint, longDivideFloatingPoint, dec2base, asciitbl, deepcopy, output, add, sub, mul, div} from  "./lib.js";

const
    // =========== FORMAT OPERATION RESULTS ===============
    // native 64 bit floating point result
    // results presentation array
    // array column to fill
    // dataview containing operands and result
    // bit width of number representation
    // binary filler
    // integer read function
    // floating point read function
    formatresults = (nres, a, col, view, nbits, f, getint, getfloat) => {
        const
            // convert to rational (floating point)
            rat = getfloat.call(view, 8, le),
            // correct ?
            fits = parseInt(nres) === parseInt(rat),
            prec = nres % 1 === rat % 1;

        let
            // init row
            row = 0;

        // format output
        // ------------------------------------------------
        a[row++][col] = `${ nbits } BIT`;
        a[row++][col] = `BINARY :`;
        a[row++][col] = `op1 : ${ dec2base(getint.call(view, 0, le), f, 2) }`;
        a[row++][col] = `op2 : ${ dec2base(getint.call(view, 4, le), f, 2) }`;
        a[row++][col] = `res : ${ dec2base(getint.call(view, 8, le), f, 2) }`;
        a[row++][col] = ``;
        a[row++][col] = `FLOATING POINT RATIONAL :`;
        a[row++][col] = `op1 : ${ getfloat.call(view, 0, le) }`;
        a[row++][col] = `op2 : ${ getfloat.call(view, 4, le) }`;
        a[row++][col] = `res : ${ rat }`;
        a[row++][col] = ``;
        a[row++][col] = `MATCH NATIVE FLOAT 64 :`;
        a[row++][col] = `${ fits && prec ? `--> CORRECT` : fits ? `--> LOSS OF PRECISION` : `--> OVERFLOW` }`;
        // ------------------------------------------------

        // return
        return a;
    },

    // ========= RETRIEVE OPERANDS FROM PARAMS ============
    // rational operands - replace underscores by negative values
    [ op1, op2 ] = process.argv.slice(2)
        .map(x => Number(x.replace(/_/u, `-`)));

try {

    const
        // check parameters
        input = isNaN(op1) === false &&
                isNaN(op2) === false;

    if (input === false)
        throw new TypeError(`please provide 2 unsigned numeric values (rational or integer).`);

    if (op2 === 0)
        throw new RangeError(`second value should not be zero.`);

    const
        // ================ DECLARATIONS ======================
        // create arraybuffers for 8, 16 and 32 bit values; each arraybuffer is 16 bytes long so we can use the same offsets
        [ b16, b32 ] = [ new ArrayBuffer(16), new ArrayBuffer(16) ],
        // create dataviews
        views = [ new DataViewAugmented(b16), new DataViewAugmented(b32) ],
        // init data types constants
        itc = [ NUMBER_16_BITS, NUMBER_32_BITS ];

    // ============== FLOATING POINT LIMITS ===============
    process.stdout.write(chalk.black.bgBlue(`==== FLOATING POINT VALID RANGE AND PRECISION LIMITS ====`));
    process.stdout.write(`\n`);
    process.stdout.write(`\n`);

    for (let i = 0; i < itc.length; i++) {
        const
            // extract data types constants
            {nbits, f, getint, setint, fmin, fmax, getfloat, setfloat} = itc[i],
            // init table
            tbl = new table();

        // set fmin as int on dataview offset 0
        setint.call(views[i], 0, fmin, le);
        // set fmax as int on dataview offset 4
        setint.call(views[i], 4, fmax, le);

        tbl
            .setHeading([ `${ nbits } BIT FLOATING POINT`, `BINARY`, `RATIONAL` ])
            .addRowMatrix([
                [ `min valid value`, dec2base(getint.call(views[i], 0, le), f, 2), getfloat.call(views[i], 0, le) ],
                [ `max valid value`, dec2base(getint.call(views[i], 4, le), f, 2), getfloat.call(views[i], 4, le) ]
            ]);

        // log floating point value limitations
        process.stdout.write(chalk.green(tbl.toString()));
        process.stdout.write(`\n`);

        // set op1 as float32 on dataview offset 0
        setfloat.call(views[i], 0, op1, le);
        // set op2 as float32 on dataview offset 4
        setfloat.call(views[i], 4, op2, le);
    }

    // ============ FLOATING POINT ARITHMETIC =============
    const
        // default native values
        [ addition, subtraction, multiplication, division ] = [ add, sub, mul, div ]
            .map(x => x(op1, op2));

    let
        // init array
        arr = asciitbl(2, 13);

    // ============= FLOATING POINT ADDITION ==============
    // for each floating point representation
    for (let col = 0; col < itc.length; col++) {
        const
            // extract data types constants
            {nbits, f, getint, setint, getfloat} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le);

        // compute value, set as int on dataview offset 8
        setint.call(views[col], 8, addFloatingPoint(a, b, nbits), le);

        // fill array
        arr = formatresults(op1 + op2, arr, col, views[col], nbits, f, getint, getfloat);
    }
    // push into presentation array (arr will be passed by reference, so we have to deep copy it)
    addition.push(...deepcopy(arr));

    // =========== FLOATING POINT SUBTRACTION =============
    // for each floating point representation
    for (let col = 0; col < itc.length; col++) {
        const
            // extract data types constants
            {nbits, f, getint, setint, getfloat} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le);

        // compute value, set as int on dataview offset 8
        setint.call(views[col], 8, subtractFloatingPoint(a, b, nbits), le);

        // fill array
        arr = formatresults(op1 - op2, arr, col, views[col], nbits, f, getint, getfloat);
    }
    // push into presentation array (arr will be passed by reference, so we have to deep copy it)
    subtraction.push(...deepcopy(arr));

    // ========== FLOATING POINT MULTIPLICATION ===========
    // for each floating point representation
    for (let col = 0; col < itc.length; col++) {
        const
            // extract data types constants
            {nbits, f, getint, setint, getfloat} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le);

        // compute value, set as int on dataview offset 8
        setint.call(views[col], 8, multiplyFloatingPoint(a, b, nbits), le);

        // fill array
        arr = formatresults(op1 * op2, arr, col, views[col], nbits, f, getint, getfloat);
    }
    // push into presentation array (arr will be passed by reference, so we have to deep copy it)
    multiplication.push(...deepcopy(arr));

    // ============ FLOATING POINT DIVISION  ==============
    // for each floating point representation
    for (let col = 0; col < itc.length; col++) {
        const
            // extract data types constants
            {nbits, f, getint, setint, getfloat} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le);

        // compute value, set as int on dataview offset 8
        setint.call(views[col], 8, longDivideFloatingPoint(a, b, nbits), le);

        // fill array
        arr = formatresults(op1 / op2, arr, col, views[col], nbits, f, getint, getfloat);
    }
    // push into presentation array (arr will be passed by reference, so we have to deep copy it)
    division.push(...deepcopy(arr));

    // print everything
    [ addition, subtraction, multiplication, division ]
        .forEach(output);

} catch (e) {
    process.stderr.write(chalk.bold.red(e[`message`]));
} finally {
    process.stdout.write(`\n`);
}