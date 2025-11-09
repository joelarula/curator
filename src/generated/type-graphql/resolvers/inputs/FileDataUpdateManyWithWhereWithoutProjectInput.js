"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataUpdateManyWithWhereWithoutProjectInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataScalarWhereInput_1 = require("../inputs/FileDataScalarWhereInput");
const FileDataUpdateManyMutationInput_1 = require("../inputs/FileDataUpdateManyMutationInput");
let FileDataUpdateManyWithWhereWithoutProjectInput = class FileDataUpdateManyWithWhereWithoutProjectInput {
};
exports.FileDataUpdateManyWithWhereWithoutProjectInput = FileDataUpdateManyWithWhereWithoutProjectInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataScalarWhereInput_1.FileDataScalarWhereInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataScalarWhereInput_1.FileDataScalarWhereInput)
], FileDataUpdateManyWithWhereWithoutProjectInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpdateManyMutationInput_1.FileDataUpdateManyMutationInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataUpdateManyMutationInput_1.FileDataUpdateManyMutationInput)
], FileDataUpdateManyWithWhereWithoutProjectInput.prototype, "data", void 0);
exports.FileDataUpdateManyWithWhereWithoutProjectInput = FileDataUpdateManyWithWhereWithoutProjectInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataUpdateManyWithWhereWithoutProjectInput", {})
], FileDataUpdateManyWithWhereWithoutProjectInput);
