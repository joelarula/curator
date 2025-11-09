"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyAndReturnModelArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelCreateManyInput_1 = require("../../../inputs/ModelCreateManyInput");
let CreateManyAndReturnModelArgs = class CreateManyAndReturnModelArgs {
};
exports.CreateManyAndReturnModelArgs = CreateManyAndReturnModelArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelCreateManyInput_1.ModelCreateManyInput], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], CreateManyAndReturnModelArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Boolean, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Boolean)
], CreateManyAndReturnModelArgs.prototype, "skipDuplicates", void 0);
exports.CreateManyAndReturnModelArgs = CreateManyAndReturnModelArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], CreateManyAndReturnModelArgs);
