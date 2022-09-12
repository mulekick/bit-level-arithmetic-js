/* eslint-disable object-property-newline */
/* eslint-disable object-curly-newline */
/* eslint-disable no-param-reassign */
/* eslint-disable no-bitwise */

// import modules
import chalk from "chalk";
import table from "ascii-table";
import {Float16Array, getFloat16, setFloat16} from "@petamoriken/float16";

// ***********************************************************************
// reminders :
// 1. the v8 engine will cast all values to unsigned int32 prior to any bit shifting operation
// 2. zero fill left shift any number n by s bits actually does n *= 2 ** s
// 3. sign preserve right shift any number n by s bits actually does n /= 2 ** s
// ***********************************************************************
// rules for this file :
// 1. no direct type casting is to be used
// 2. only the following operators are allowed :
// assignment   :   =, &=, |=, ^=, <<=, >>=, >>>=
// comparison   :   ===, !==
// bitwise      :   &, |, ^, ~, <<, >>, >>>
// note : rules 1 and 2 do not apply to conversions between rational and fixed point, we use native 64 bit
// floating point casting and native arithmetic operators to keep as much precision as possible after conversion
// ***********************************************************************
// sources for the algorithms implemented here are :
// 1. integer arithmetic :
//   addition :                 https://ryanstutorials.net/binary-tutorial/binary-arithmetic.php#:~:text=Binary%20Addition
//   subtraction :              https://ryanstutorials.net/binary-tutorial/binary-arithmetic.php#:~:text=Binary%20Subtraction
//   multiplication :           https://ryanstutorials.net/binary-tutorial/binary-arithmetic.php#:~:text=Binary%20Multiplication
//   division :                 https://ryanstutorials.net/binary-tutorial/binary-arithmetic.php#:~:text=Binary%20Division
// 2. fixed point arithmetic
//   long division :            https://paulmason.me/blog/2018-06-20-a-simple-implementation-of-division-in-rust/
//                              https://blog.veitheller.de/Fixed_Point_Division.html
// 3. floating point arithmetic :
//   addition, subtraction :    https://en.wikipedia.org/w/index.php?title=Floating-point_arithmetic#Addition_and_subtraction
//   multiplication, division : https://en.wikipedia.org/w/index.php?title=Floating-point_arithmetic#Multiplication_and_division
// ***********************************************************************
// all results will be returned as unsigned int32 values, written to arraybuffers at the desired offset,
// and then be read from arraybuffer into the desired data type
// ***********************************************************************
// the calculation result will be compared to its native floating point 64 bit counterpart to indicate overflow and loss of precision
// ***********************************************************************
// rounding the fractional part following calculations on fixed point and floating point numbers
// may guarantee precision up to a certain number of digits, however it is not implemented as of now
// ************************************************************************
// last but not least, thanks to @petamoriken for providing the Float16 v8 implementation !
// check it at https://github.com/petamoriken/float16
// ***********************************************************************

class DataViewAugmented extends DataView {
    // eslint-disable-next-line no-useless-constructor
    constructor(buf) {
        // pass buffer to parent class constructor
        super(buf);
    }

    getFloat16(byteOffset, littleEndian) {
        // receive object as this, pass as argument
        return getFloat16(this, byteOffset, littleEndian);
    }

    setFloat16(byteOffset, value, littleEndian) {
        // receive object as this, pass as argument
        return setFloat16(this, byteOffset, value, littleEndian);
    }
}

const
    // ======== ARCHITECTURE ========
    // retrieve system endian
    endian = () => {
        const
            b = new ArrayBuffer(2),
            u8 = new Uint8Array(b),
            u16 = new Uint16Array(b);
        u8[0] = 0xAA; // set first byte
        u8[1] = 0xBB; // set second byte
        if (u16[0] === 0xBBAA)
            return `little endian`;
        if (u16[0] === 0xAABB)
            return `big endian`;
        throw new Error(`Something crazy just happened`);
    },
    // export constant
    le = endian() === `little endian`,

    // ======== CONSTANTS PER DATA TYPE ========
    // will make code more readable
    p = DataViewAugmented.prototype,
    // ----------------------------------------------------
    // sign bit per integer type (8, 16, 32 bits) SIGNED
    [ I8_MSB, I16_MSB, I32_MSB ] = [ 0x80, 0x8000, 0x80000000 ],
    // ----------------------------------------------------
    // binary fillers per integer type (8, 16, 32 bits)
    [ BIN_FILLER_8, BIN_FILLER_16, BIN_FILLER_32 ] = [ `00000000`, `0000000000000000`, `00000000000000000000000000000000` ],
    // hexadecimal fillers per integer type (8, 16, 32 bits)
    [ HEX_FILLER_8, HEX_FILLER_16, HEX_FILLER_32 ] = [ `00`, `0000`, `00000000` ],
    // ----------------------------------------------------
    // data types constants : allocated memory, min value, max value, binary filler, hex filler, int get, int set, fixed point scale factor, float min value, float max value, float get, float set
    NUMBER_8_BITS  = {nbits: 8,  min: 0x81,       max: 0x7f,       f: BIN_FILLER_8,  h: HEX_FILLER_8,  getint: p.getInt8,  setint: p.setInt8,  sf: 4,  fmin: null,       fmax: null,       getfloat: () => null,   setfloat: () => null},
    NUMBER_16_BITS = {nbits: 16, min: 0x8001,     max: 0x7fff,     f: BIN_FILLER_16, h: HEX_FILLER_16, getint: p.getInt16, setint: p.setInt16, sf: 8,  fmin: 0x0400,     fmax: 0x7bff,     getfloat: p.getFloat16, setfloat: p.setFloat16},
    NUMBER_32_BITS = {nbits: 32, min: 0x80000001, max: 0x7fffffff, f: BIN_FILLER_32, h: HEX_FILLER_32, getint: p.getInt32, setint: p.setInt32, sf: 16, fmin: 0x00800000, fmax: 0x7f7fffff, getfloat: p.getFloat32, setfloat: p.setFloat32},
    // ----------------------------------------------------
    // float32 sign bit, mantissa bit width, mantissa bits mask, implicit bit mask, exponent bias (127), unbiased exponents for zero (0b00000000 biased) and infinity (0b11111111 biased)
    F32_CONSTANTS = {sbit: I32_MSB, mwidth: 23, mmask: 0x7fffff, imask: 0x800000, ebias: 0b01111111, ezero: 0b10000001, einfinity: 0b10000000},
    // float16 sign bit, mantissa bit width, mantissa bits mask, implicit bit mask, exponent bias (15), unbiased exponents for zero (0b00000 biased) and infinity (0b11111 biased)
    F16_CONSTANTS = {sbit: I16_MSB, mwidth: 10, mmask: 0x3ff,    imask: 0x400,    ebias: 0b01111,    ezero: 0b10001,    einfinity: 0b10000},

    // ================ BINARY PROCESSING =================
    compareNatural = (a, b) => {
        // init result (0 = equal, 1 = a greater, -1 = b greater)
        // this function processes unsigned integers only (msb is not the sign bit)
        // thus, only use it to compare natural numbers, not to compare integers
        let
            // init mask
            mask = I32_MSB;
        // do
        do {
            const
                // let msba = a & mask
                msba = a & mask,
                // let msbb = b & mask
                msbb = b & mask;
            // if (msba | msbb) !== 0
            if ((msba | msbb) !== 0) {
                // if msba === msbb
                if (msba === msbb) {
                    // do nothing, proceed to next bit
                // else if msba !== 0
                } else if (msba !== 0) {
                    // return 1
                    return 1;
                // else if msbb !== 0
                } else if (msbb !== 0) {
                    // return -1
                    return -1;
                }
            }
            // zero fill right shift mask by 1
            mask >>>= 1;
        // while mask !== 0
        } while (mask !== 0);
        // return 0 if both values are equal
        return 0;
    },
    // ----------------------------------------------------
    getMostSignificantBit = a => {
    // get number most significant bit
        let
            // init mask
            mask = I32_MSB;
        // do
        do {
            const
                // let msb = a & mask
                msb = a & mask;
            // if current bit equals 1
            if (msb !== 0)
                // return current bit's power of 2
                return msb;
            // else proceed to next bit, zero fill right shift mask by 1
            mask >>>= 1;
        // continue until mask bit is discarded
        } while (mask !== 0);
        // return 0 if all bits of a equal zero
        return 0;
    },

    // =============== INTEGER ARITHMETIC =================
    addInteger = (a, b) => {
        // use bitwise operations
        let
            // init sum
            sum = a,
            // let carries = 0
            carries = 0,
            // init num
            num = null;
            // do
        do {
            // if carries = 0
            if (carries === 0)
                // unshift first array element into num
                num = b;
                // extract carries by doing carries = sum & num
            carries = sum & num;
            // add numbers by doing sum = sum ^ num
            sum ^= num;
            // zero fill left shift carries by 1 bit
            carries <<= 1;
            // let num = carries
            num = carries;
            // loop while num !== 0 to make sure leftmost bit is discarded
        } while (num !== 0);
        // return sum
        return sum;
    },
    // ----------------------------------------------------
    // zero minus any binary number is nothing but 2’s complement of this number
    twosComplement = a => addInteger(~a, 1),
    // --> NEVER CHANGE THE SIGN BIT TO CHANGE THE SIGN OF A NUMBER !
    // --> ALWAYS USE TWO'S COMPLEMENT !
    // ----------------------------------------------------
    // use bitwise operations
    // use two's complement
    subtractInteger = (a, b) => addInteger(a, twosComplement(b)),
    // ----------------------------------------------------
    multiplyInteger = (a, b) => {
        // use bitwise operations
        let
            // init res
            res = 0,
            // let pos = 1
            pos = 1;
            //  do
        do {
            // if a & pos !== 0
            if ((a & pos) !== 0)
                // add val to res
                res = addInteger(res, b);
            // zero fill left shift b by 1 bit
            b <<= 1;
            // zero fill left shift pos by 1 bit
            pos <<= 1;
            // loop while pos !== 0 to make sure mask bit is discarded
        } while (pos !== 0);
        // return res
        return res;
    },
    // ----------------------------------------------------
    divideInteger = (a, b) => {
        // use bitwise operations
        // use two's complement
        const
            // dividend sign bit
            sa = a & I32_MSB,
            // divisor sign bit
            sb = b & I32_MSB;

        // invert value of dividend if negative
        if (sa !== 0)
            a = twosComplement(a);
        // invert value of divisor if negative
        if (sb !== 0)
            b = twosComplement(b);

        let
            // init remainder
            remainder = a,
            // init quotient
            quotient = 0;

        // while remainder >= divisor
        while (compareNatural(remainder, b) !== -1) {
            let
                // init shift = 0
                shift = 0;
            // while remainder > (divisor << shift)
            while (compareNatural(remainder, b << shift) === 1)
                // increment shift by 1
                shift = addInteger(shift, 1);
            // if (divisor << shift) > remainder
            if (compareNatural(b << shift, remainder) === 1)
                // decrement shift by 1
                shift = subtractInteger(shift, 1);
            // let quotient = quotient + (1 << shift)
            quotient = addInteger(quotient, 1 << shift);
            // let remainder = remainder - (divisor << shift)
            remainder = subtractInteger(remainder, b << shift);
        // end while
        }

        // dividend and divisor are negative, remainder is negative
        if ((sa & sb) !== 0)
            return [ quotient, twosComplement(remainder) ];
        // dividend is negative, quotient and remainder are negative
        else if (sa !== 0)
            return [ twosComplement(quotient), twosComplement(remainder) ];
        // divisor is negative, quotient is negative
        else if (sb !== 0)
            return [ twosComplement(quotient), remainder ];
        // none are negative, quotient and remainder are positive
        return [ quotient, remainder ];
    },

    // ============ FIXED POINT ARITHMETIC ================
    toFixedPoint = (rn, sf) => {
        // convert from rational number to fixed point (rational times 2 exp scale factor)
        const
            // set to 64 bit floating point number, compute fixed point value
            v = Float64Array.of(rn)[0] * (1 << sf);
        // cast into desired integer type will be done post return
        return v;
    },
    // ----------------------------------------------------
    toRational = (n, sf) => {
        // convert from fixed point to rational number (fixed point divided by 2 exp scale factor)
        const
            // compute floating point value, set to 64 bit floating point number
            v = Float64Array.of(n / (1 << sf))[0];
        // return
        return v;
    },
    // ----------------------------------------------------
    longDivideRational = (a, b, f) => {
        // implements long division on fixed-point values, will return a fixed-point quotient and no remainder
        // long division won't return a remainder, so sign and absolute value can be processed separately
        // the scale factor f is the number of bits reserved for fractional part in the fixed-point quotient
        const
            // dividend sign bit
            sa = a & I32_MSB,
            // divisor sign bit
            sb = b & I32_MSB,
            // extract quotient sign bit
            sq = sa ^ sb;

        // invert value of dividend if negative
        if (sa !== 0)
            a = twosComplement(a);
        // invert value of divisor if negative
        if (sb !== 0)
            b = twosComplement(b);

        let
            // init quotient as fixed-point
            quotient = 0;

        // increment f by 1 in order to perform the first division, extract the integer part of fixed-point quotient and the first fixed-point remainder
        f = addInteger(f, 1);

        // while (a !== 0 & f !== 0)
        while (a !== 0 & f !== 0) {
            const
                // extract fractional bits
                // init q and r
                [ q, r ] = divideInteger(a, b);
            // convert fractional bits to fixed-point, store in quotient
            // ZFLS q by f bits, add q to quotient
            quotient = addInteger(quotient, q << f);
            // update remainder in order to extract more fractional bits
            // ZFLS r by 1 bit, affect to a
            a = r << 1;
            // decrement f by 1
            --f;
        // end while
        }

        // SPRS fixed-point quotient by 1 bit
        quotient >>= 1;

        // affect sign and return
        return sq === 0 ? quotient : twosComplement(quotient);
    },

    // ========== FLOATING POINT ARITHMETIC ===============
    extractFromFloatingPoint = (a, n) => {
        // extract sign, exponent and mantissa for a
        const
            // retrieve constants
            {sbit, mwidth, mmask, imask} = n === 16 ? F16_CONSTANTS : F32_CONSTANTS,
            // isolate sign bit (apply bit mask on bit 31)
            s = a & sbit,
            // isolate exponent, keep bias in exponent so it remains positive (apply bit mask on bit 31, ZFRS by 23 bits)
            e = (a & ~sbit) >>> mwidth;

        let
            // isolate mantissa (apply bit mask on bits 23 to 31, add implicit bit on bit 23)
            m = a & mmask | imask;

        // reaffect sign on mantissa (if sign bit of mantissa is 1, then mantissa = two's complement of mantissa)
        if (s !== 0)
            m = twosComplement(m);

        // return (remember that mantissa is signed)
        return [ e, m ];
    },
    // ----------------------------------------------------
    renderToFloatingPoint = (e, m, n) => {
        // remove sign, set sign bit, normalize, adjust exponent and return float32 representation
        const
            // retrieve constants
            {sbit, mwidth, imask, ebias, ezero} = n === 16 ? F16_CONSTANTS : F32_CONSTANTS,
            // init sign from mantissa sign bit (since it the result of a bit shifting computation, sign will always be on bit 31)
            s = (m & I32_MSB) === 0 ? 0 : sbit;

        // remove sign from mantissa (if sign bit of mantissa is 1, then mantissa = two's complement of mantissa)
        if (s !== 0)
            m = twosComplement(m);

        // if mantissa equals zero
        if (m === 0) {
            // affect reserved value to exponent after adding bias
            e = addInteger(ezero, ebias);

        // else
        } else {
            // while mantissa msb is greater than implicit bit
            while (compareNatural(getMostSignificantBit(m), imask) === 1) {
                // set mantissa precision (ZFRS mantissa and increment exponent until mantissa msb equals implicit bit)
                m >>>= 1;
                e = addInteger(e, 1);
            }

            // while mantissa msb is lower than implicit bit
            while (compareNatural(imask, getMostSignificantBit(m)) === 1) {
                // set mantissa precision (ZFLS mantissa and decrement exponent until mantissa msb equals implicit bit)
                m <<= 1;
                e = subtractInteger(e, 1);
            }

            // normalize mantissa (remove implicit bit on bit 23)
            m ^= imask;
        }

        // realign and truncate exponent (ZFLS exponent by 23 bits, apply bit mask on bit 31)
        e = e << mwidth & ~sbit;

        // return
        return s | e | m;
    },
    // ----------------------------------------------------
    addFloatingPoint = (a, b, n) => {
        // read bits of float32 representations of a and b from dataview
        let
            // extract sign, exponent and mantissa for a
            [ ea, ma ] = extractFromFloatingPoint(a, n),
            // extract sign, exponent and mantissa for b
            [ eb, mb ] = extractFromFloatingPoint(b, n),
            // init res sign, exponent and mantissa
            [ er, mr ] = [ null, null ];

        // if a exponent is greater than b exponent
        if (compareNatural(ea, eb) === 1) {
            // res exponent = a exponent
            er = ea;
            // SPRS b mantissa by a exponent minus b exponent bits
            mb >>= subtractInteger(ea, eb);
        // if a exponent is lower than or equal to b exponent
        } else {
            // res exponent = b exponent
            er = eb;
            // SPRS a mantissa by b exponent minus a exponent bits
            ma >>= subtractInteger(eb, ea);
        }

        // res mantissa = addInteger(a mantissa, b mantissa)
        mr = addInteger(ma, mb);

        // return floating point
        return renderToFloatingPoint(er, mr, n);
    },
    // ----------------------------------------------------
    subtractFloatingPoint = (a, b, n) => {
        // read bits of float32 representations of a and b from dataview
        let
            // extract sign, exponent and mantissa for a
            [ ea, ma ] = extractFromFloatingPoint(a, n),
            // extract sign, exponent and mantissa for b
            [ eb, mb ] = extractFromFloatingPoint(b, n),
            // init res sign, exponent and mantissa
            [ er, mr ] = [ null, null ];

        // if a exponent is greater than b exponent
        if (compareNatural(ea, eb) === 1) {
            // res exponent = a exponent
            er = ea;
            // SPRS b mantissa by a exponent minus b exponent bits
            mb >>= subtractInteger(ea, eb);
        // if a exponent is lower than or equal to b exponent
        } else {
            // res exponent = b exponent
            er = eb;
            // SPRS a mantissa by b exponent minus a exponent bits
            ma >>= subtractInteger(eb, ea);
        }

        // res mantissa = subtractInteger(a mantissa, b mantissa)
        mr = subtractInteger(ma, mb);

        // return floating point
        return renderToFloatingPoint(er, mr, n);
    },
    // ----------------------------------------------------
    multiplyFloatingPoint = (a, b, n) => {
        // read bits of float32 representations of a and b from dataview
        const
            // retrieve constants
            {mwidth, ebias} = n === 16 ? F16_CONSTANTS : F32_CONSTANTS,
            // extract sign, exponent and mantissa for a
            [ ea, ma ] = extractFromFloatingPoint(a, n),
            // extract sign, exponent and mantissa for b
            [ eb, mb ] = extractFromFloatingPoint(b, n);
        let
            // init res sign, exponent and mantissa
            [ er, mr ] = [ null, null ];

        // add a exponent and b exponent
        er = addInteger(ea, eb);

        // remove excedent bias from res exponent
        er = subtractInteger(er, ebias);

        // interpret a mantissa and b mantissa as 32 bit fixed point values with a 23 scale factor, perform multiplication

        // res mantissa = multiplyInteger(a mantissa, b mantissa) / scale factor
        mr = multiplyInteger(ma, mb) >> mwidth;

        // return floating point
        return renderToFloatingPoint(er, mr, n);
    },
    // ----------------------------------------------------
    longDivideFloatingPoint = (a, b, n) => {
        // read bits of float32 representations of a and b from dataview
        const
        // retrieve constants
            {mwidth, ebias} = n === 16 ? F16_CONSTANTS : F32_CONSTANTS,
            // extract sign, exponent and mantissa for a
            [ ea, ma ] = extractFromFloatingPoint(a, n),
            // extract sign, exponent and mantissa for b
            [ eb, mb ] = extractFromFloatingPoint(b, n);
        let
        // init res sign, exponent and mantissa
            [ er, mr ] = [ null, null ];

        // subtract b exponent from a exponent
        er = subtractInteger(ea, eb);

        // add missing bias to res exponent
        er = addInteger(er, ebias);

        // interpret a mantissa and b mantissa as 32 bit fixed point values with a 23 scale factor, perform long division

        // res mantissa = longDivideRational(a mantissa, b mantissa)
        mr = longDivideRational(ma, mb, mwidth);

        // return floating point
        return renderToFloatingPoint(er, mr, n);
    },

    // =============== MISCELLANOUS ================
    dec2base = (dec, filler, base) => {
        // format number to a numeral system compliant string
        const n = filler + (dec >>> 0).toString(base);
        return n.substring(n.length - filler.length);
    },
    // ----------------------------------------------------
    asciitbl = (c, r) => {
        // create ascii-table compliant 2 dimensional array (array of rows containing arrays of columns)
        // init empty arrays
        const cols = new Array(c);
        let rows = new Array(r);
        // fill rows array with null
        rows.fill(null);
        // create deep copies of cols for each rows element
        rows = rows
            // eslint-disable-next-line no-unused-vars
            .map(nul => cols.slice());
        // return
        return rows;
    },
    // ----------------------------------------------------
    // deep copy shorthand for a 2 dimensional array
    deepcopy = o => o.map(x => x.slice()),
    // =============== OUTPUT ================
    output = x => {
        const
            title = x[0],
            f64val = x[1],
            f32val = x[2],
            f16val = x[3],
            results = new table();

        results.setHeading(x[4]);

        x.slice(5).forEach(y => results.addRow(...y));

        process.stdout.write(`\n`);
        process.stdout.write(chalk.black.bgBlue(`==== ${ title } ====`));
        process.stdout.write(`\n`);
        process.stdout.write(`\n`);
        process.stdout.write(chalk.bgGreen.black(`native operators implementation results :`));
        process.stdout.write(`\n`);
        process.stdout.write(`\n`);
        process.stdout.write(chalk.red(`${ f64val }`));
        process.stdout.write(`\n`);
        process.stdout.write(chalk.red(`${ f32val }`));
        process.stdout.write(`\n`);
        process.stdout.write(chalk.red(`${ f16val }`));
        process.stdout.write(`\n`);
        process.stdout.write(`\n`);
        process.stdout.write(chalk.bgGreen.black(`current operators implementation results :`));
        process.stdout.write(`\n`);
        process.stdout.write(chalk.red(results.toString()));
        process.stdout.write(`\n`);
    },
    // ----------------------------------------------------
    add = (op1, op2) => [
        `ADDITION RESULTS RENDERING`,
        `64 BIT FLOATING POINT : ${ op1 } + ${ op2 } = ${ op1 + op2 }`,
        `32 BIT FLOATING POINT : ${ Float32Array.of(op1)[0] } + ${ Float32Array.of(op2)[0] } = ${ Float32Array.of(Float32Array.of(op1)[0] + Float32Array.of(op2)[0])[0] }`,
        `16 BIT FLOATING POINT : ${ Float16Array.of(op1)[0] } + ${ Float16Array.of(op2)[0] } = ${ Float16Array.of(Float16Array.of(op1)[0] + Float16Array.of(op2)[0])[0] }`
    ],
    // ----------------------------------------------------
    sub = (op1, op2) => [
        `SUBTRACTION RESULTS RENDERING`,
        `64 BIT FLOATING POINT : ${ op1 } - ${ op2 } = ${ op1 - op2 }`,
        `32 BIT FLOATING POINT : ${ Float32Array.of(op1)[0] } - ${ Float32Array.of(op2)[0] } = ${ Float32Array.of(Float32Array.of(op1)[0] - Float32Array.of(op2)[0])[0] }`,
        `16 BIT FLOATING POINT : ${ Float16Array.of(op1)[0] } - ${ Float16Array.of(op2)[0] } = ${ Float16Array.of(Float16Array.of(op1)[0] - Float16Array.of(op2)[0])[0] }`
    ],
    // ----------------------------------------------------
    mul = (op1, op2) => [
        `MULTIPLICATION RESULTS RENDERING`,
        `64 BIT FLOATING POINT : ${ op1 } * ${ op2 } = ${ op1 * op2 }`,
        `32 BIT FLOATING POINT : ${ Float32Array.of(op1)[0] } * ${ Float32Array.of(op2)[0] } = ${ Float32Array.of(Float32Array.of(op1)[0] * Float32Array.of(op2)[0])[0] }`,
        `16 BIT FLOATING POINT : ${ Float16Array.of(op1)[0] } * ${ Float16Array.of(op2)[0] } = ${ Float16Array.of(Float16Array.of(op1)[0] * Float16Array.of(op2)[0])[0] }`
    ],
    // ----------------------------------------------------
    div = (op1, op2) => [
        `DIVISION RESULTS RENDERING`,
        `64 BIT FLOATING POINT : ${ op1 } / ${ op2 } = ${ op1 / op2 }`,
        `32 BIT FLOATING POINT : ${ Float32Array.of(op1)[0] } / ${ Float32Array.of(op2)[0] } = ${ Float32Array.of(Float32Array.of(op1)[0] / Float32Array.of(op2)[0])[0] }`,
        `16 BIT FLOATING POINT : ${ Float16Array.of(op1)[0] } / ${ Float16Array.of(op2)[0] } = ${ Float16Array.of(Float16Array.of(op1)[0] / Float16Array.of(op2)[0])[0] }`
    ];

export {
    // ================= EXPORTS ===================
    chalk, table, Float16Array, DataViewAugmented,
    // ----------------------------------------------------
    endian, le,
    // ----------------------------------------------------
    I8_MSB, I16_MSB, I32_MSB,
    BIN_FILLER_8, BIN_FILLER_16, BIN_FILLER_32,
    HEX_FILLER_8, HEX_FILLER_16, HEX_FILLER_32,
    // ----------------------------------------------------
    NUMBER_8_BITS, NUMBER_16_BITS, NUMBER_32_BITS,
    // ----------------------------------------------------
    compareNatural, getMostSignificantBit,
    addInteger, twosComplement, subtractInteger, multiplyInteger, divideInteger,
    toFixedPoint, toRational, longDivideRational,
    addFloatingPoint, subtractFloatingPoint, multiplyFloatingPoint, longDivideFloatingPoint,
    dec2base, asciitbl, deepcopy,
    output, add, sub, mul, div
};