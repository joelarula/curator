"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataCreateManyProjectInputEnvelope = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateManyProjectInput_1 = require("../inputs/FileDataCreateManyProjectInput");
let FileDataCreateManyProjectInputEnvelope = class FileDataCreateManyProjectInputEnvelope {
};
exports.FileDataCreateManyProjectInputEnvelope = FileDataCreateManyProjectInputEnvelope;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataCreateManyProjectInput_1.FileDataCreateManyProjectInput], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataCreateManyProjectInputEnvelope.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Boolean, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Boolean)
], FileDataCreateManyProjectInputEnvelope.prototype, "skipDuplicates", void 0);
exports.FileDataCreateManyProjectInputEnvelope = FileDataCreateManyProjectInputEnvelope = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataCreateManyProjectInputEnvelope", {})
], FileDataCreateManyProjectInputEnvelope);
