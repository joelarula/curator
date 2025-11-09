"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataCreateOrConnectWithoutProjectInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateWithoutProjectInput_1 = require("../inputs/FileDataCreateWithoutProjectInput");
const FileDataWhereUniqueInput_1 = require("../inputs/FileDataWhereUniqueInput");
let FileDataCreateOrConnectWithoutProjectInput = class FileDataCreateOrConnectWithoutProjectInput {
};
exports.FileDataCreateOrConnectWithoutProjectInput = FileDataCreateOrConnectWithoutProjectInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereUniqueInput_1.FileDataWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataWhereUniqueInput_1.FileDataWhereUniqueInput)
], FileDataCreateOrConnectWithoutProjectInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateWithoutProjectInput_1.FileDataCreateWithoutProjectInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataCreateWithoutProjectInput_1.FileDataCreateWithoutProjectInput)
], FileDataCreateOrConnectWithoutProjectInput.prototype, "create", void 0);
exports.FileDataCreateOrConnectWithoutProjectInput = FileDataCreateOrConnectWithoutProjectInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataCreateOrConnectWithoutProjectInput", {})
], FileDataCreateOrConnectWithoutProjectInput);
