
/********************\
***** Data Types *****
\********************/

// Input data types

type PathName = string;

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
    Err?: Err
}

interface Evaluation {
    code: PathName;
    tests: PathName;
    result: Result;
}

interface PointData {
    functionality: Map<string, number>;
    testing: Map<string, number>;
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


/********************\
*** Handling input ***
\********************/

/*
    Parse command line arguments
    Outputs: The file locations of `[infile, outfile, scorefile]`
*/
function parse_command_line(): [string, string, string] {
    let args: string[] = process.argv.slice(2);

    if (args.length != 3) {
        throw("Usage: <infile> <outfile> <scorefile>");
    }

    return [args[0], args[1], args[2]];
}

/*
    Read raw evaluation data from JSON file
    Inputs: The `path` to the evaluation file
    Outputs: List of evaluations present in file
*/
function read_evaluation_from_file(path: PathName): Evaluation[] {
    let fs = require('fs');
    let contents: string = fs.readFileSync(path);
    return JSON.parse(contents);
}

/*
    Splits the evaluations into functionality, wheats, and chaffs
    Inputs: The list of `results` to be split
    Outputs: The `[test_results, wheat_results, chaff_results]`
*/
function partition_results(results: Evaluation[]): [Evaluation[], Evaluation[], Evaluation[]] {
    let test_results: Evaluation[] = [],
        wheat_results: Evaluation[] = [],
        chaff_results: Evaluation[] = [];

    let result: Evaluation;
    for (result of results) {
        if (result.code.includes("wheat")) { 
            wheat_results.push(result);

        } else if (result.code.includes("chaff")) { 
            chaff_results.push(result);

        } else { 
            test_results.push(result);
        }
    };

    return [test_results, wheat_results, chaff_results];
}

/*
    Read scoring data from JSON file
    Inputs: The `path` to the score file
    Outputs: Object containing the scoring data
*/
function read_score_data_from_file(path: PathName): PointData {
    let fs = require('fs');
    let contents: string = fs.readFileSync(path);
    let raw_score_data = JSON.parse(contents);
    return {
            functionality: new Map(raw_score_data.functionality),
            testing: new Map(raw_score_data.testing)
        };
}


/*********************\
*** Handling output ***
\*********************/

/*
    Writes a Gradescope report to a file
    Inputs: The `path` to the output file;
            The `report` to be written
*/
function write_report_to_file(path: PathName, report: GradescopeReport) {
    let fs = require('fs');
    let data: string = JSON.stringify(report);
    fs.writeFileSync(path, data);
    console.log("Wrote output to " + path);
}

/************************\
*** Generating reports ***
\************************/

//// Helpers

/*
    Gets the name a file from path name
    Inputs: The `path_name` of the file
    Outputs: The name of the file
*/
function get_file_name(path_name: PathName): string {
    let path = require('path');
    return path.parse(path_name).base;
}

/*
    Gets the pure location of a test or test block from a full location name
    E.g.: "file:///autograder/results/docdiff-wheat-2017.arr;docdiff-tests.arr/tests.arr:8:0-19:3"
          --> "tests.arr:8:0-19:3"
    Used to uniquely identify tests/test blocks between evaluations

    Inputs: The full location name
    Outputs: The pure location name
*/
function get_loc_name(loc: string): string {
    return loc.split("/")[-1];
}


// Generate student reports

/*
    Generates a functionality report(s); 
    If test file errors, returns a single report with 0/1 and error;
    Otherwise, return report for each block, each out of 1

    Inputs: The `test_result` of a single test suite
    Outputs: A list of reports for each block
*/
function generate_functionality_report(test_result: Evaluation): GradescopeTestReport[] {
    let result: Result = test_result.result;

    // If errors, 0 functionality and provide error reason
    if (result.Err) {
        return [{
                name: get_file_name(test_result.code),
                score: 0,
                max_score: 1,
                output: `Error: ${result.Err}`,
                visibility: "visible"
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
                    name: block.name,
                    score: 0,
                    max_score: 1,
                    output: "Block errored.",
                    visibility: "after_published"
                };
        } else {
            // Otherwise, compare number of passed tests to total number of tests
            let total_tests: number = block.tests.length;
            let passed_tests: number = block.tests.filter(test => test.passed).length;
            report = {
                    name: block.name,
                    score: passed_tests === total_tests ? 1 : 0,
                    max_score: 1,
                    output: passed_tests === total_tests 
                        ? `Passed all ${total_tests} tests in this block!`
                        : `Missing ${total_tests - passed_tests} tests in this block`,
                    visibility: "after_published"
                };
        }

        // Add block to report
        reports.push(report);
    }

    return reports;
}

/*
    Takes a wheat evaluation, and finds all of the invalid tests and blocks;
    If the wheat passes, returns null;
    Otherwise, returns the pure locations of all invalid tests/blocks and 
                       the name of the block it contains/itself

    Inputs: The `wheat` evaluation
    Outputs: null if valid wheat, otherwise the invalid tests/blocks as:
             [list of (test location, block name), list of (block location, block name)]
*/
function get_invalid_tests_and_blocks(wheat: Evaluation): [[string, string][], [string, string][]] | null {
    if (wheat.result.Err) {
        return [[],[]];
    }

    let invalid_tests: [string, string][] = [];
    let invalid_blocks: [string, string][] = [];

    let block: TestBlock;
    for (block of wheat.result.Ok) {
        // If the block errors, add to invalid_blocks
        if (block.error) {
            invalid_blocks.push([get_loc_name(block.loc), block.name]);
        }

        let test: Test;
        for (test of block.tests) {
            // If a test fails, add to invalid_tests
            if (!test.passed) {
                invalid_tests.push([get_loc_name(test.loc), block.name]);
            }
        }
    }

    if ((invalid_tests.length === 0) && (invalid_blocks.length === 0)) {
        // This means the wheat is valid
        return null;
    } else {
        return [invalid_tests, invalid_blocks];
    }
}

/*
    Generates a wheat testing report; 
    If the wheat is invalid, generates report with reason;
    Otherwise, generates report with positive message

    Inputs: The `wheat_result` evaluation
    Outputs: A report for the wheat
*/
function generate_wheat_report(wheat_result: Evaluation): GradescopeTestReport {
    // Find the invalid tests/blocks
    let invalid: [[string, string][], [string, string][]] | null = 
        get_invalid_tests_and_blocks(wheat_result);

    let output: string;
    if (invalid === null) {
        // Valid wheat
        output = "Passed wheat!";
    } else if (wheat_result.result.Err) {
        // Test file errored
        output = `Wheat errored; ${wheat_result.result.Err}`;
    } else {
        let [invalid_tests, invalid_blocks] = invalid;
        if (invalid_tests.length > 0) {
            // Invalid test
            output = `Wheat failed test in block ${invalid_tests[0][1]}`;
        } else if (invalid_blocks.length > 0) {
            // Block errored
            output = `Wheat caused error in block ${invalid_blocks[0][1]}`;
        } else {
            throw "Wheat failed but no reason given.";
        }
    }

    return {
            name: get_file_name(wheat_result.code),
            score: (invalid === null) ? 1 : 0,
            max_score: 1,
            output: output,
            visibility: "after_published"
        }
}

/*
    A curried function which generates a chaff testing report;
    It first takes in the list of wheat evaluations, and finds all
        invalid tests and test blocks between wheats;
    It then takes in a chaff evaluation, and checks if it is caught
        by the valid tests/blocks

    Inputs: The `wheat_results` evaluations
    Outputs: A function which generates a chaff report from an evaluation
*/
function generate_chaff_report(wheat_results: Evaluation[]) {
    let all_invalid_tests: Set<string> = new Set(),
        all_invalid_blocks: Set<string> = new Set();

    // Go through wheats and find invalid tests/blocks
    let wheat_result: Evaluation;
    for (wheat_result of wheat_results) {
        let invalid: [[string, string][], [string, string][]] | null =
            get_invalid_tests_and_blocks(wheat_result);

        if (invalid !== null) {
            let invalid_test: [string, string];
            for (invalid_test of invalid[0]) {
                all_invalid_tests.add(invalid_test[0]);
            }

            let invalid_block: [string, string];
            for (invalid_block of invalid[1]) {
                all_invalid_blocks.add(invalid_block[0]);
            }
        }
    }

    /*
        Generates a chaff testing report; ignores invalid tests/blocks;
        If the chaff is invalid, generates report with reason;
        Otherwise, generates report with negative message

        Inputs: The `chaff_results` to report
        Outputs: The report for the chaff
    */
    return function (chaff_result: Evaluation): GradescopeTestReport {
        if (chaff_result.result.Err) {
            // Test file errors
            return {
                    name: get_file_name(chaff_result.code),
                    score: 1,
                    max_score: 1,
                    output: `Chaff caught; error: ${chaff_result.result.Err}!`,
                    visibility: "after_published"
                };
        } else {
            // Loop through blocks to check if chaff is caught
            let block: TestBlock;
            for (block of chaff_result.result.Ok) {
                if (block.error && !all_invalid_blocks.has(get_loc_name(block.loc))) {
                    // Block errors
                    return {
                            name: get_file_name(chaff_result.code),
                            score: 1,
                            max_score: 1,
                            output: `Chaff caught; error in block ${block.name}!`,
                            visibility: "after_published"
                        }
                }

                let test: Test;
                for (test of block.tests) {
                    // Test fails
                    if (!test.passed && !all_invalid_tests.has(get_loc_name(test.loc))) {
                        return {
                                name: get_file_name(chaff_result.code),
                                score: 1,
                                max_score: 1,
                                output: `Chaff caught; test failed in block ${block.name}!`,
                                visibility: "after_published"
                            }
                    }
                }
            }

            // If this is reached, the chaff is not caught
            return {
                    name: get_file_name(chaff_result.code),
                    score: 0,
                    max_score: 1,
                    output: `Chaff not caught.`,
                    visibility: "after_published"
                }
        }
    }
}


// Generate TA reports

/*
    Generates a score report for a given list of reports

    Inputs: The `reports` to summarize;
            The `point_values` to apply to the reports;
            The `name` to use in the report
*/
function generate_score_report(
        reports: GradescopeTestReport[],
        point_values: Map<string, number>,
        name: string): GradescopeTestReport {

    // Find the score summary from the reports
    let total_score: number = 0,
        possible_score: number = 0;

    let report: GradescopeTestReport;
    for (report of reports) {
        let points = point_values.has(report.name) ? point_values.get(report.name) : 1;

        total_score += report.score === report.max_score ? points : 0;
        possible_score += points;
    }

    // Return report
    return {
            name: name,
            score: total_score,
            max_score: possible_score,
            output: "",
            visibility: "hidden"
        };
}

// Generate overall report

/*
    Generates the overall report from all provided reports
    Inputs: List of `all_reports` to include
    Outputs: The overall Gradescope report
*/
function generate_overall_report(
        all_reports: GradescopeTestReport[]): GradescopeReport {
    return {
            visibility: "after_published",
            stdout_visibility: "after_published",
            tests: all_reports,
        };
}


function main() {

    /*
    ** Handling input
    */

    // Get input and output file names from command line
    let [infile, outfile, scorefile]: [string, string, string] = parse_command_line();

    // Parse autograder json output
    let results: Evaluation[] = read_evaluation_from_file(infile);

    // Split up evaluations into test, wheat, and chaff results
    let [test_results, wheat_results, chaff_results]: [Evaluation[], Evaluation[], Evaluation[]] =
        partition_results(results);

    // Get point value data
    let point_values: PointData = read_score_data_from_file(scorefile);


    /*
    ** Generating reports
    */

    // Generate student reports

    // Functionality
    let functionality_reports: GradescopeTestReport[][] = 
        test_results.map(generate_functionality_report)

    // Wheats
    let wheat_reports: GradescopeTestReport[] =
        wheat_results.map(generate_wheat_report);

    // Chaffs
    let chaff_reports: GradescopeTestReport[] =
        chaff_results.map(generate_chaff_report(wheat_results));

    // Overview
    let student_reports: GradescopeTestReport[] = [].concat(
        ...functionality_reports,
        wheat_reports,
        chaff_reports,);


    // Generate TA reports

    // Functionality
    let functionality_scores: GradescopeTestReport[] = 
        functionality_reports.map(report => 
            generate_score_report(report, point_values.functionality, "Functionality score"));

    // Testing
    let wheat_score: GradescopeTestReport =
        generate_score_report(wheat_reports, point_values.testing, "Wheats score");

    let chaff_score: GradescopeTestReport =
        generate_score_report(chaff_reports, point_values.testing, "Chaffs score");

    // Overview
    let ta_reports: GradescopeTestReport[] = [].concat(
        functionality_scores, [
        wheat_score,
        chaff_score,],);


    // Generate overall report

    let all_reports: GradescopeTestReport[] = [].concat(student_reports, ta_reports)

    let gradescope_report: GradescopeReport = generate_overall_report(all_reports);


    /*
    ** Handling output
    */

    write_report_to_file(outfile, gradescope_report);
}

main();
