
/********************\
***** Data Types *****
\********************/

type PathName = string;

type Implementation = PathName;

type TestSuite = PathName;

interface Test {
    loc: string;
    passed: boolean;
}

interface TestBlock {
    name: string,
    loc: string,
    error: boolean,
    tests: Test[],
}

enum Err {
    Unknown = "Unknown",
    Compilation = "Compilation",
    OutOfMemory = "OutOfMemory",
    Timeout = "Timeout",
    Runtime = "Runtime",
}

interface Result {
    Ok?: TestBlock[],
    Err?: string
}

interface Evaluation {
    code: Implementation;
    tests: TestSuite;
    result: Result;
}

// Gradescope types

interface GradescopeReport {
    visibility: string;
    stdout_visibility: string;
    tests: GradescopeTestReport[];
}

interface GradescopeTestReport {
    name: string;
    score: number;
    max_score: number;
    output: string;
    visibility: string;
}



/************************\
***** Implementation *****
\************************/


//// Input/output

function read_evaluation_from_file(path: PathName): Evaluation[] {
    let fs = require('fs');
    let contents = fs.readFileSync(path);
    return JSON.parse(contents);
}

function write_report_to_file(path: PathName, report: GradescopeReport) {
    let fs = require('fs');
    let data: string = JSON.stringify(report);
    fs.writeFileSync(path, data);
    console.log("Wrote output to " + path);
}


//// Other helpers

// Gets the name a file from path
function get_file_name(path_name: PathName): string {
    let path = require('path');
    return path.parse(path_name).base;
}

// Gets the name of a test or block from a location
function get_loc_name(loc: string): string {
    return loc.split("/")[-1];
}


//// Generate Gradescope reports for functionality, wheats, and chaffs

function generate_functionality_report(test_result: Evaluation): GradescopeTestReport[] {
    // If errors, 0 functionality and provide error reason
    let result: Result = test_result.result;

    if (result.Err) {
        return [{
                "name": get_file_name(test_result.code),
                "score": 0,
                "max_score": 1,
                "output": `Error: ${result.Err}`,
                "visibility": "visible"
            }];
    }


    // If no error, report what blocks passed/failed
    let reports: GradescopeTestReport[] = [];

    let block: TestBlock;
    for (block of result.Ok) {
        let report: GradescopeTestReport;
        if (block.error) {
            // If the block errors, then failed block
            report = {
                    "name": block.name,
                    "score": 0,
                    "max_score": 1,
                    "output": "Block errored.",
                    "visibility": "after_published"
                };
        } else {
            // Otherwise, compare number of passed tests to total number of tests
            let total_tests: number = block.tests.length;
            let passed_tests: number = block.tests.filter(test => test.passed).length;
            report = {
                    "name": block.name,
                    "score": passed_tests === total_tests ? 1 : 0,
                    "max_score": 1,
                    "output": passed_tests === total_tests 
                        ? `Passed all ${total_tests} tests in this block!`
                        : `Missing ${total_tests - passed_tests} tests in this block`,
                    "visibility": "after_published"
                };
        }

        // Add block to report
        reports.push(report);
    }

    return reports;
}

// Returns a string of what caused failure, or null if no failure
function find_where_fails(test_result: Evaluation): string | null {
    // If whole suite errors, return error
    let result: Result = test_result.result;

    if (result.Err) {
        return `file Error: ${result.Err}`
    }

    // If no error, look for errored blocks and failed tests
    let reports: GradescopeTestReport[] = [];

    let block: TestBlock;
    for (block of result.Ok) {
        if (block.error) {
            // If the block errors, return block
            return `block errored: ${get_loc_name(block.loc)}`;
        } else {
            // If any test fails in block, return block
            let total_tests: number = block.tests.length;
            let passed_tests: number = block.tests.filter(test => test.passed).length;
            if (passed_tests != total_tests) {
                return `failed test in block: ${get_loc_name(block.loc)}`;
            }
        }
    }

    // If no blocks error or tests fail, return success (null)
    return null;
}

function generate_wheat_report(wheat_result: Evaluation): GradescopeTestReport {
    let message: string | null = find_where_fails(wheat_result);

    return {
            "name": get_file_name(wheat_result.code),
            "score": (message === null) ? 1 : 0,
            "max_score": 1,
            "output": (message === null) ? "Passed wheat!" : `Failed wheat; ${message}`,
            "visibility": "after_published"
        }
}

// Returns [invalid_tests, invalid_blocks] location names based on wheat results
function get_invalid_tests_and_blocks(wheat_results: Evaluation[]): [string[], string[]] {
    let invalid_tests: string[] = [];
    let invalid_blocks: string[] = [];
    
    let wheat: Evaluation;
    for (wheat of wheat_results) {
        if (wheat.result.Ok) {

            let block: TestBlock;
            for (block of wheat.result.Ok) {
                // If the block errors, add to invalid_blocks
                if (block.error) {
                    invalid_blocks.push(get_loc_name(block.loc));
                }

                let test: Test;
                for (test of block.tests) {
                    // If a test fails, add to invalid_tests
                    if (!test.passed) {
                        invalid_tests.push(get_loc_name(test.loc));
                    }
                }
            }
        }
    }

    return [invalid_tests, invalid_blocks];
}

// A helper function that should exist
function filter_in_place<T>(func: (T) => boolean, lis: T[]) {
    let i: number;
    for (i = lis.length - 1; i >= 0; i--) {
        if (!func(lis[i])) {
            lis.splice(i, 1);
        }
    }
}

function generate_chaff_report(invalid_tests: string[], invalid_blocks: string[]): 
                              (Evaluation) => GradescopeTestReport {
    // We use a partial function to precompute invalid tests and blocks from wheats
    return function(chaff_result: Evaluation): GradescopeTestReport {
        let caught_chaff: boolean;
        if (chaff_result.result.Err) {
            // If the chaff errors, then it's caught
            caught_chaff = true;
        } else {
            // Otherwise, remove all invalid blocks and tests from evaluation
            let adjusted_chaff_result: Evaluation = JSON.parse(JSON.stringify(chaff_result));

            // remove invalid blocks
            let blocks: TestBlock[] = adjusted_chaff_result.result.Ok;
            filter_in_place(block => !invalid_blocks.includes(get_loc_name(block.loc)), blocks);

            // remove invalid tests
            let block: TestBlock;
            for (block of blocks) {
                filter_in_place(test => !invalid_tests.includes(get_loc_name(test.loc)), block.tests);
            }

            // and then check if the adjusted test suite catches the chaff
            caught_chaff = find_where_fails(adjusted_chaff_result) !== null;
        }

        return {
                "name": get_file_name(chaff_result.code),
                "score": caught_chaff ? 1 : 0,
                "max_score": 1,
                "output": caught_chaff ? "Caught chaff!" : "Didn't catch chaff.",
                "visibility": "after_published"
            }
    }
}

function main() {
    // Parse command line arguments
    let args: string[] = process.argv.slice(2);

    if (args.length != 2) {
        throw("Usage: <infile> <outfile>");
    }

    let infile: string = args[0],
        outfile: string = args[1];

    // Parse autograder json output
    let results: Evaluation[] = read_evaluation_from_file(infile);


    // Split up evaluations into test, wheat, and chaff results
    let test_results: Evaluation[] = [],
        wheat_results: Evaluation[] = [],
        chaff_results: Evaluation[] = [];

    let result: Evaluation;
    for (result of results) {
        if (result.code.includes("wheat")) { 
            wheat_results.push(result) 

        } else if (result.code.includes("chaff")) { 
            chaff_results.push(result) 

        } else { 
            test_results.push(result) 
        }
    };

    // Get invalid tests and blocks for chaff report
    let [invalid_tests, invalid_blocks]: [string[], string[]] = 
        get_invalid_tests_and_blocks(wheat_results);

    // Generate reports
    let functionality_reports: GradescopeTestReport[][] = 
            test_results.map(generate_functionality_report),
        wheat_test_reports: GradescopeTestReport[] = 
            wheat_results.map(generate_wheat_report),
        chaff_test_reports: GradescopeTestReport[] = 
            chaff_results.map(generate_chaff_report(invalid_tests, invalid_blocks));

    let gradescope_report: GradescopeReport = {
                "visibility": "after_published",
                "stdout_visibility": "after_published",
                "tests": [].concat(
                    wheat_test_reports,
                    chaff_test_reports,
                    ...functionality_reports)
            };


    // Write report to outfile
    write_report_to_file(outfile, gradescope_report);
}

main();
