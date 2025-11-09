"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataCreateNestedManyWithoutProjectInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateManyProjectInputEnvelope_1 = require("../inputs/FileDataCreateManyProjectInputEnvelope");
const FileDataCreateOrConnectWithoutProjectInput_1 = require("../inputs/FileDataCreateOrConnectWithoutProjectInput");
const FileDataCreateWithoutProjectInput_1 = require("../inputs/FileDataCreateWithoutProjectInput");
const FileDataWhereUniqueInput_1 = require("../inputs/FileDataWhereUniqueInput");
let FileDataCreateNestedManyWithoutProjectInput = class FileDataCreateNestedManyWithoutProjectInput {
};
exports.FileDataCreateNestedManyWithoutProjectInput = FileDataCreateNestedManyWithoutProjectInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataCreateWithoutProjectInput_1.FileDataCreateWithoutProjectInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataCreateNestedManyWithoutProjectInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataCreateOrConnectWithoutProjectInput_1.FileDataCreateOrConnectWithoutProjectInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataCreateNestedManyWithoutProjectInput.prototype, "connectOrCreate", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateManyProjectInputEnvelope_1.FileDataCreateManyProjectInputEnvelope, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataCreateManyProjectInputEnvelope_1.FileDataCreateManyProjectInputEnvelope)
], FileDataCreateNestedManyWithoutProjectInput.prototype, "createMany", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataWhereUniqueInput_1.FileDataWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataCreateNestedManyWithoutProjectInput.prototype, "connect", void 0);
exports.FileDataCreateNestedManyWithoutProjectInput = FileDataCreateNestedManyWithoutProjectInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataCreateNestedManyWithoutProjectInput", {})
], FileDataCreateNestedManyWithoutProjectInput);
