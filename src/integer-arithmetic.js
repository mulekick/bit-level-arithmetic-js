// import modules
import {chalk, table, DataViewAugmented, le, NUMBER_8_BITS, NUMBER_16_BITS, NUMBER_32_BITS, addInteger, subtractInteger, multiplyInteger, divideInteger, dec2base, asciitbl, deepcopy, output, add, sub, mul, div} from  "./lib.js";

const
    // =========== FORMAT OPERATION RESULTS ===============
    // native 64 bit floating point result
    // results presentation array
    // array column to fill
    // dataview containing operands and result
    // bit width of number representation
    // binary filler
    // integer read function
    formatresults = (nres, a, col, view, nbits, f, getint) => {
        const
            // correct ?
            fits = nres === Float64Array.of(getint.call(view, 8, le))[0];

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
        a[row++][col] = `INTEGER :`;
        a[row++][col] = `op1 : ${ getint.call(view, 0, le) }`;
        a[row++][col] = `op2 : ${ getint.call(view, 4, le) }`;
        a[row++][col] = `res : ${ getint.call(view, 8, le) }`;
        a[row++][col] = ``;
        a[row++][col] = `MATCH NATIVE FLOAT 64 :`;
        a[row++][col] = `${ fits ? `--> CORRECT` : `--> OVERFLOW` }`;
        // ------------------------------------------------

        // return
        return a;
    },

    // ========== RETRIEVE OPERANDS FROM PARAMS ===========
    // integer operands - replace underscores by negative values
    [ op1, op2 ] = process.argv.slice(2)
        .map(x => Number(x.replace(/_/u, `-`)));

try {

    const
        // check parameters
        input = isNaN(op1) === false &&
                isNaN(op2) === false;

    if (input === false)
        throw new TypeError(`please provide 2 valid integer values.`);

    if (op2 === 0)
        throw new RangeError(`second value should not be zero.`);

    const
        // ================== DECLARATIONS ====================
        // create arraybuffers for 8, 16 and 32 bit values; each arraybuffer is 16 bytes long so we can use the same offsets
        [ b8, b16, b32 ] = [ new ArrayBuffer(16), new ArrayBuffer(16), new ArrayBuffer(16) ],
        // create dataviews
        views = [ new DataViewAugmented(b8), new DataViewAugmented(b16), new DataViewAugmented(b32) ],
        // init data types constants
        itc = [ NUMBER_8_BITS, NUMBER_16_BITS, NUMBER_32_BITS ];

    // ================= INTEGER LIMITS ===================
    process.stdout.write(chalk.black.bgBlue(`==== INTEGER VALID RANGE AND PRECISION LIMITS ====`));
    process.stdout.write(`\n`);
    process.stdout.write(`\n`);

    for (let i = 0; i < itc.length; i++) {
        const
        // extract data types constants
            {nbits, min, max, f, getint, setint} = itc[i],
            // init table
            tbl = new table();

        // set min as int on dataview offset 0
        setint.call(views[i], 0, min, le);
        // set max as int on dataview offset 4
        setint.call(views[i], 4, max, le);

        tbl
            .setHeading([ `${ nbits } BIT`, `BINARY`, `INTEGER` ])
            .addRowMatrix([
                [ `min valid value`, dec2base(getint.call(views[i], 0, le), f, 2), getint.call(views[i], 0, le) ],
                [ `max valid value`, dec2base(getint.call(views[i], 4, le), f, 2), getint.call(views[i], 4, le) ]
            ]);

        // log integer value limitations
        process.stdout.write(chalk.green(tbl.toString()));
        process.stdout.write(`\n`);

        // set op1 as int on dataview offset 0
        setint.call(views[i], 0, op1, le);
        // set op2 as int on dataview offset 4
        setint.call(views[i], 4, op2, le);
    }

    // =============== INTEGER ARITHMETIC =================
    const
        // default native values
        [ addition, subtraction, multiplication, division ] = [ add, sub, mul, div ]
            .map(x => x(op1, op2));
    let
        // init array
        arr = asciitbl(3, 13);

    // ================ INTEGER ADDITION ==================
    // for each data type
    for (let col = 0; col < itc.length; col++) {
        const
            // extract data types constants
            {nbits, f, getint, setint} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le);

        // compute value, set as int on dataview offset 8
        setint.call(views[col], 8, addInteger(a, b), le);

        // fill array
        arr = formatresults(op1 + op2, arr, col, views[col], nbits, f, getint);
    }
    // push into presentation array (arr will be passed by reference, so we have to deep copy it)
    addition.push(...deepcopy(arr));

    // =============== INTEGER SUBTRACTION ================
    // for each data type
    for (let col = 0; col < itc.length; col++) {
        const
            // extract data types constants
            {nbits, f, getint, setint} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le);

        // compute value, set as int on dataview offset 8
        setint.call(views[col], 8, subtractInteger(a, b), le);

        // fill array
        arr = formatresults(op1 - op2, arr, col, views[col], nbits, f, getint);
    }
    // push into presentation array (arr will be passed by reference, so we have to deep copy it)
    subtraction.push(...deepcopy(arr));

    // ============= INTEGER MULTIPLICATION ===============
    // for each data type
    for (let col = 0; col < itc.length; col++) {
        const
            // extract data types constants
            {nbits, f, getint, setint} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le);

        // compute value, set as int on dataview offset 8
        setint.call(views[col], 8, multiplyInteger(a, b), le);

        // fill array
        arr = formatresults(op1 * op2, arr, col, views[col], nbits, f, getint);
    }
    // push into presentation array (arr will be passed by reference, so we have to deep copy it)
    multiplication.push(...deepcopy(arr));

    // init array
    arr = asciitbl(3, 14);

    // ================ INTEGER DIVISION ==================
    // for each data type
    for (let col = 0, row = 0; col < itc.length; col++, row = 0) {
        const
            // extract data types constants
            {nbits, f, getint, setint} = itc[col],
            // read operands
            a = getint.call(views[col], 0, le),
            b = getint.call(views[col], 4, le),
            // compute values
            c = divideInteger(a, b);

        // set quotient as int on dataview offset 8
        setint.call(views[col], 8, c[0], le);
        // set remainder as int on dataview offset 12
        setint.call(views[col], 12, c[1], le);

        const
            // correct ?
            fits = parseInt(op1 / op2) === Float64Array.of(getint.call(views[col], 8, le))[0] && op1 % op2 === Float64Array.of(getint.call(views[col], 12, le))[0];

        // we won't be using result formatting function here since we need to display the quotient AND the remainder
        arr[row++][col] = `${ nbits } BIT`;
        arr[row++][col] = `BINARY :`;
        arr[row++][col] = `op1 = ${ dec2base(a, f, 2) }`;
        arr[row++][col] = `op2 = ${ dec2base(b, f, 2) }`;
        arr[row++][col] = `result = ${ dec2base(getint.call(views[col], 8, le), f, 2) }`;
        arr[row++][col] = `remain = ${ dec2base(getint.call(views[col], 12, le), f, 2) }`;
        arr[row++][col] = ``;
        arr[row++][col] = `INTEGER :`;
        arr[row++][col] = `op1 : ${ a }`;
        arr[row++][col] = `op2 : ${ b }`;
        arr[row++][col] = `res : ${ getint.call(views[col], 8, le) }, remain ${ getint.call(views[col], 12, le) }`;
        arr[row++][col] = ``;
        arr[row++][col] = `MATCH NATIVE FLOAT 64 :`;
        arr[row++][col] = `${ fits ? `--> CORRECT` : `--> OVERFLOW` }`;
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
